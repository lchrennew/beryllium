import _ from 'lodash'

/**
 * Export the subdomain handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
export default options => {
  const conf = (options && options.subdomainMapping) || {}
  const enabled = conf.enable && conf.baseDomains?.length
  return async (ctx, next) => {
    const { request: req, response: res } = ctx
    if (!enabled) {
      return next()
    }

    let { host } = req.headers
    const origUrl = host + req.url;

    // trim :<port>
    [host] = host.split(':')

    // match & remove base domain
    const i = _.findIndex(conf.baseDomains, (dom) => _.endsWith(host, dom))
    if (i === -1) {
      return next()
    }
    host = _.trimEnd(host.slice(0, -conf.baseDomains[i].length), '.')
    if (!host.length) {
      // no subdomains
      return next()
    }

    req.url = `/${host.split('.')
      .join('/')}${req.url}`
    ctx.mappedSubDomain = true

    options.logger.debug(`${origUrl} => ${req.url}`)

    // pass on to next middleware
    await next()
  }
}

