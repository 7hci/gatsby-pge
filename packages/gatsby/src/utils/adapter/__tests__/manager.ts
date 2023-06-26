import { store } from "../../../redux"
import {
  getRoutesManifest,
  getFunctionsManifest,
  setWebpackAssets,
} from "../manager"
import { state as stateDefault } from "./fixtures/state"
import { IGatsbyState } from "../../../internal"

jest.mock(`../../../redux`, () => {
  return {
    emitter: {
      on: jest.fn(),
    },
    store: {
      getState: jest.fn(),
    },
  }
})

jest.mock(`../../engines-helpers`, () => {
  return {
    shouldGenerateEngines: jest.fn().mockReturnValue(true),
  }
})

function mockStoreState(
  state: IGatsbyState,
  additionalState: IGatsbyState = {} as IGatsbyState
): void {
  const mergedState = { ...state, ...additionalState }
  ;(store.getState as jest.Mock).mockReturnValue(mergedState)
}

const fixturesDir = `${__dirname}/fixtures`

let cwdToRestore
beforeAll(() => {
  cwdToRestore = process.cwd()
})

afterAll(() => {
  process.chdir(cwdToRestore)
})

describe(`getRoutesManifest`, () => {
  it(`should return routes manifest`, () => {
    mockStoreState(stateDefault)
    process.chdir(fixturesDir)
    setWebpackAssets(new Set([`app-123.js`]))

    const routesManifest = getRoutesManifest()

    expect(routesManifest).toMatchSnapshot()
  })
})

describe(`getFunctionsManifest`, () => {
  it(`should return functions manifest`, () => {
    mockStoreState(stateDefault)
    process.chdir(fixturesDir)

    const functionsManifest = getFunctionsManifest()

    expect(functionsManifest).toMatchInlineSnapshot(`
      Array [
        Object {
          "functionId": "static-index-js",
          "pathToEntryPoint": ".cache/functions/static/index.js",
          "requiredFiles": Array [
            ".cache/functions/static/index.js",
          ],
        },
        Object {
          "functionId": "ssr-engine",
          "pathToEntryPoint": ".cache/page-ssr/lambda.js",
          "requiredFiles": Array [
            ".cache/data/datastore/data.mdb",
            ".cache/page-ssr/lambda.js",
            ".cache/query-engine/index.js",
          ],
        },
      ]
    `)
  })
})
