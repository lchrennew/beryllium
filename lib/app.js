import fse from 'fs-extra'
import Koa from 'koa'
import Router from '@koa/router'
import c2k from 'koa-connect'
import morgan from 'morgan'
import path from 'path'
import archiveHandler from './archiveHandler'
import archiveLinkHandler from './archiveLinkHandler'
import blobHandler from './blobHandler'
import commitHandler from './commitHandler'
import contentHandler from './contentHandler'
import htmlHandler from './htmlHandler'
import rawHandler from './rawHandler'
import subdomainHandler from './subdomainHandler'
import treeHandler from './treeHandler'
import xferHandler from './xferHandler'

const getLogDirectory = options => path.normalize(options.logs?.logsDir ?? 'logs')
const getLogFile = options => path.join(getLogDirectory(options), 'request.log')
const getLogStream = options => fse.createWriteStream(getLogFile(options), { flags: 'a' })
const getMorganFormat = options => options.logs?.reqLogFormat ?? 'common'
const getMorganOptions = options => ({ stream: getLogStream(options) })

export default options => {
  const app = new Koa()

  // const app = express();

  // app.disable('x-powered-by');
  // app.set('title', options.appTitle || 'Helix Git Server');

  // request logger
  morgan(getMorganFormat(options), getMorganOptions(options)) |> c2k |> app.use

  // setup routing

  // subdomain handler (e.g. http://<subdomain>.localtest.me/foo/bar -> /<subdomain>/foo/bar)
  app.use(subdomainHandler(options))


  const router = new Router()

  // raw content handler
  router.get('/raw/:owner/:repo/:ref/:path(.*)', ...rawHandler(options))
  router.get('/:owner/:repo/raw/:ref/:path(.*)', ...rawHandler(options))

  // git transfer protocol handler (git clone, pull, push)
  router.all('/:owner/:repo.git(.*)', ...xferHandler(options))

  // github api handlers
  router.get('/api/repos/:owner/:repo/git/blobs/:file_sha', ...blobHandler(options))
  router.get('/api/repos/:owner/:repo/git/trees/:ref_or_sha(.*)', ...treeHandler(options))
  router.get('/api/repos/:owner/:repo/contents:path(.*)', ...contentHandler(options))
  router.get('/api/repos/:owner/:repo/commits', ...commitHandler(options))

  // github archive handlers
  // archive link handlers (redirect to /codeload/...)
  router.get('/api/repos/:owner/:repo/zipball/:ref(.*)?', archiveLinkHandler(options, 'zip'))
  router.get('/api/repos/:owner/:repo/tarball/:ref(.*)?', archiveLinkHandler(options, 'tar.gz'))
  router.get('/:owner/:repo/archive/:ref(.*).zip', archiveLinkHandler(options, 'zip'))
  router.get('/:owner/:repo/archive/:ref(.*).tar.gz', archiveLinkHandler(options, 'tar.gz'))
  // archive request handlers
  router.get('/codeload/:owner/:repo/legacy.zip/:ref(.*)', ...archiveHandler(options, 'zip'))
  router.get('/codeload/:owner/:repo/zip/:ref(.*)', ...archiveHandler(options, 'zip'))
  router.get('/codeload/:owner/:repo/legacy.tar.gz/:ref(.*)', ...archiveHandler(options, 'tar.gz'))
  router.get('/codeload/:owner/:repo/tar.gz/:ref(.*)', ...archiveHandler(options, 'tar.gz'))

  // github html handlers (github-like web server)
  router.get('/:owner/:repo/blob/:ref/:path(.*)', htmlHandler(options, 'blob')) // single file
  router.get('/:owner/:repo/tree/:ref', htmlHandler(options, 'tree')) // directory
  router.get('/:owner/:repo/tree/:ref/:path(.*)', htmlHandler(options, 'tree')) // directory
  router.get('/:owner/:repo', htmlHandler(options, 'root')) // home/root directory

  app.use(router.routes()).use(router.allowedMethods())

  return app
}
