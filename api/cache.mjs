import NodeCache from 'node-cache'
export default new NodeCache({ stdTTL: 600, checkperiod: 120 })
