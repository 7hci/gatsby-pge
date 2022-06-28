/* global HAS_REACT_18 */

/**
 * Since react 18, render and hydrate moved to react-dom/client
 * returns correct hydrate and render function based on installed react-dom version
 */
export function reactDOMUtils() {
  let render
  let hydrate

  if (HAS_REACT_18) {
    const reactDomClient = require(`react-dom/client`)
    render = (Component, el) => reactDomClient.createRoot(el).render(Component)
    hydrate = (Component, el) => reactDomClient.hydrateRoot(el, Component)
  } else {
    const reactDomClient = require(`react-dom`)
    render = reactDomClient.render
    hydrate = reactDomClient.hydrate
  }

  return { render, hydrate }
}
