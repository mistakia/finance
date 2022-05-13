export function getConnections(state) {
  return state.get('connections')
}

export function getConnectionsByOrder(state) {
  const connections = state.get('connections')

  return connections.sortBy((c) => c.id)
}
