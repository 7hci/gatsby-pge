import React, { createElement } from "react"
import PropTypes from "prop-types"
import { apiRunner } from "./api-runner-browser"
import { grabMatchParams } from "./find-path"
import { renderToString } from "react-dom/server"
import { StaticQueryContext } from "gatsby"
import { parse } from "node-html-parser"

import { VALID_NODE_NAMES } from "./head/constants"

// Renders page
class PageRenderer extends React.Component {
  render() {
    const props = {
      ...this.props,
      params: {
        ...grabMatchParams(this.props.location.pathname),
        ...this.props.pageResources.json.pageContext.__params,
      },
    }

    const preferDefault = m => (m && m.default) || m

    const pageElement = createElement(
      preferDefault(this.props.pageResources.component),
      {
        ...props,
        key: this.props.path || this.props.pageResources.page.path,
      }
    )

    const pageComponent = this.props.pageResources.component

    if (pageComponent.head) {
      if (typeof pageComponent.head !== `function`)
        throw new Error(
          `Expected "head" export to be a function got "${typeof pageComponent.head}".`
        )

      const headElement = createElement(
        StaticQueryContext.Provider,
        { value: this.props.pageResources.staticQueryResults },
        createElement(pageComponent.head, props, null)
      )

      // extract head nodes from string
      const rawString = renderToString(headElement)
      const headNodes = parse(rawString).childNodes

      // Remove previous head nodes
      const prevHeadNodes = [...document.querySelectorAll(`[data-gatsby-head]`)]
      prevHeadNodes.forEach(e => e.remove())

      // add attribute to new head nodes while showing warning if it's not a valid node
      const newHeadNodes = headNodes.map(node => {
        if (process.env.NODE_ENV !== `production`) {
          if (
            !VALID_NODE_NAMES.includes(node.rawTagName) &&
            node.rawTagName !== `script` // exempt scripts from this check since we have special warnings for them
          ) {
            console.warn(
              `<${
                node.rawTagName
              }> is not a valid head element. Please use one of the following: ${VALID_NODE_NAMES.join(
                `, `
              )}`
            )
          }
          if (node.rawTagName === `script`)
            console.warn(
              `It's not a good practice to add scripts here. Please use the <Script> component in your page template instead. see https://www.gatsbyjs.com/docs/reference/built-in-components/gatsby-script/`
            )
        }

        // create element since node isn't a real element
        const element = document.createElement(node.rawTagName)

        element.textContent = node.textContent
        element.setAttribute(`data-gatsby-head`, true)

        Object.entries(node.attributes).forEach(([key, value]) => {
          element.setAttribute(key, value)
        })

        return element
      })

      document.head.append(...newHeadNodes)
    }

    const wrappedPage = apiRunner(
      `wrapPageElement`,
      { element: pageElement, props },
      pageElement,
      ({ result }) => {
        return { element: result, props }
      }
    ).pop()

    return wrappedPage
  }
}

PageRenderer.propTypes = {
  location: PropTypes.object.isRequired,
  pageResources: PropTypes.object.isRequired,
  data: PropTypes.object,
  pageContext: PropTypes.object.isRequired,
}

export default PageRenderer
