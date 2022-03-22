import report from "gatsby-cli/lib/reporter"
import { Span } from "opentracing"
import apiRunner from "./api-runner-node"
import { store } from "../redux"
import { getDataStore, getNode } from "../datastore"
import { actions } from "../redux/actions"
import { IGatsbyState, IGatsbyNode } from "../redux/types"
import type { GatsbyIterable } from "../datastore/common/iterable"
import readline from "readline"
import events from "events"

const { deleteNode } = actions

/**
 * Finds the name of all plugins which implement Gatsby APIs that
 * may create nodes, but which have not actually created any nodes.
 */
function discoverPluginsWithoutNodes(
  storeState: IGatsbyState,
  nodes: GatsbyIterable<IGatsbyNode>
): Array<string> {
  // Find out which plugins own already created nodes
  const nodeOwnerSet = new Set([`default-site-plugin`])
  nodes.forEach(node => nodeOwnerSet.add(node.internal.owner))

  return storeState.flattenedPlugins
    .filter(
      plugin =>
        // "Can generate nodes"
        plugin.nodeAPIs.includes(`sourceNodes`) &&
        // "Has not generated nodes"
        !nodeOwnerSet.has(plugin.name)
    )
    .map(plugin => plugin.name)
}

/**
 * Warn about plugins that should have created nodes but didn't.
 */
function warnForPluginsWithoutNodes(
  state: IGatsbyState,
  nodes: GatsbyIterable<IGatsbyNode>
): void {
  const pluginsWithNoNodes = discoverPluginsWithoutNodes(state, nodes)

  pluginsWithNoNodes.map(name =>
    report.warn(
      `The ${name} plugin has generated no Gatsby nodes. Do you need it?`
    )
  )
}

/**
 * Return the set of nodes for which its root node has not been touched
 */
function getStaleNodes(
  state: IGatsbyState,
  nodes: GatsbyIterable<IGatsbyNode>
): GatsbyIterable<IGatsbyNode> {
  return nodes.filter(node => {
    let rootNode = node
    let next: IGatsbyNode | undefined = undefined

    let whileCount = 0
    do {
      next = rootNode.parent ? getNode(rootNode.parent) : undefined
      if (next) {
        rootNode = next
      }
    } while (next && ++whileCount < 101)

    if (whileCount > 100) {
      console.log(
        `It looks like you have a node that's set its parent as itself`,
        rootNode
      )
    }

    return !state.nodesTouched.has(rootNode.id)
  })
}

/**
 * Find all stale nodes and delete them
 */
function deleteStaleNodes(
  state: IGatsbyState,
  nodes: GatsbyIterable<IGatsbyNode>
): void {
  const staleNodes = getStaleNodes(state, nodes)

  staleNodes.forEach(node => store.dispatch(deleteNode(node)))
}

let isInitialSourcing = true
let sourcingCount = 0
export default async ({
  webhookBody,
  pluginName,
  parentSpan,
  deferNodeMutation = false,
}: {
  webhookBody: unknown
  pluginName?: string
  parentSpan?: Span
  deferNodeMutation?: boolean
}): Promise<void> => {
  const traceId = isInitialSourcing
    ? `initial-sourceNodes`
    : `sourceNodes #${sourcingCount}`

  if (process.env.GATSBY_CLOUD_DATALAYER) {
    const got = require(`got`)

    const sourcePlugins: Array<string> = []
    const runAlwaysList = [
      `gatsby-source-filesystem`,
      `internal-data-bridge`,
      `gatsby-source-git`,
    ]
    for (const plugin of store.getState().flattenedPlugins) {
      if (
        plugin.nodeAPIs.includes(`sourceNodes`) &&
        !runAlwaysList.includes(plugin.name)
      ) {
        sourcePlugins.push(plugin.name)
      }
    }

    for (const node of getDataStore().iterateNodes()) {
      if (sourcePlugins.includes(node.internal.owner)) {
        store.dispatch(actions.touchNode(node, { name: node.internal.owner }))
      }
    }

    const rl = readline.createInterface({
      input: got.stream(process.env.GATSBY_CLOUD_DATALAYER),
      crlfDelay: Infinity,
    })

    rl.on(`line`, line => {
      try {
        const parsed = JSON.parse(line)
        if (parsed.type === `CREATE_NODE`) {
          actions.createNode(parsed.node, parsed.plugin)(store.dispatch)
        }
        if (parsed.type === `DELETE_NODE`) {
          store.dispatch(actions.deleteNode(parsed.node, parsed.plugin))
        }
      } catch (err) {
        console.log({ err })
        // do nothing
      }
    })

    await events.once(rl, `close`)

    for (const plugin of store.getState().flattenedPlugins) {
      if (
        !plugin.nodeAPIs.includes(`sourceNodes`) ||
        !runAlwaysList.includes(plugin.name)
      ) {
        if (plugin.nodeAPIs.includes(`sourceNodes`)) {
          report.verbose(`[source-nodes] ignore ${plugin.name}`)
        }

        continue
      }

      report.verbose(`[source-nodes] running ${plugin.name}`)
      await apiRunner(`sourceNodes`, {
        traceId,
        waitForCascadingActions: true,
        deferNodeMutation,
        parentSpan,
        webhookBody: webhookBody || {},
        pluginName: plugin.name,
      })
    }
  } else {
    await apiRunner(`sourceNodes`, {
      traceId,
      waitForCascadingActions: true,
      deferNodeMutation,
      parentSpan,
      webhookBody: webhookBody || {},
      pluginName,
    })
  }

  await getDataStore().ready()

  // We only warn for plugins w/o nodes and delete stale nodes on the first sourcing.
  if (isInitialSourcing) {
    const state = store.getState()
    const nodes = getDataStore().iterateNodes()

    warnForPluginsWithoutNodes(state, nodes)

    deleteStaleNodes(state, nodes)
    isInitialSourcing = false
  }

  store.dispatch(actions.apiFinished({ apiName: `sourceNodes` }))

  sourcingCount += 1
}
