import fse from 'fs-extra'
import Koa from 'koa'
import c2k from 'koa-connect'
import morgan from 'morgan'
import path from 'path'
import routes from './core/routes'
import subdomainHandler from './handlers/subdomainHandler'

const getLogDirectory = options => path.normalize(options.logs?.logsDir ?? 'logs')
const getLogFile = options => path.join(getLogDirectory(options), 'request.log')
const getLogStream = options => fse.createWriteStream(getLogFile(options), { flags: 'a' })
const getMorganFormat = options => options.logs?.reqLogFormat ?? 'common'
const getMorganOptions = options => ({ stream: getLogStream(options) })

export default options => {
  const app = new Koa()

  // app.disable('x-powered-by');
  // app.set('title', options.appTitle || 'CEBTech Git Server');

  // request logger
  morgan(getMorganFormat(options), getMorganOptions(options)) |> c2k |> app.use

  // setup routing

  // subdomain handler (e.g. http://<subdomain>.localtest.me/foo/bar -> /<subdomain>/foo/bar)
  app.use(subdomainHandler(options))
  app.use((ctx, next) => {
    ctx.set('x-powered-by', options.appTitle || 'CEBTech Git Server')
  })

  routes(app, options)

  return app
}
