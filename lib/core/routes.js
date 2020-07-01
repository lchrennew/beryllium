import Router from '@koa/router'
import archiveHandler from '../handlers/archiveHandler'
import archiveLinkHandler from '../handlers/archiveLinkHandler'
import blobHandler from '../handlers/blobHandler'
import commitHandler from '../handlers/commitHandler'
import contentHandler from '../handlers/contentHandler'
import htmlHandler from '../handlers/htmlHandler'
import rawHandler from '../handlers/rawHandler'
import treeHandler from '../handlers/treeHandler'
import xferHandler from '../handlers/xferHandler'

export default (app, options)=>{

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
  router.get('/:owner/:repo/blob/:ref/:path(.*)', ...htmlHandler(options, 'blob')) // single file
  router.get('/:owner/:repo/tree/:ref', ...htmlHandler(options, 'tree')) // directory
  router.get('/:owner/:repo/tree/:ref/:path(.*)', ...htmlHandler(options, 'tree')) // directory
  router.get('/:owner/:repo', ...htmlHandler(options, 'root')) // home/root directory

  app.use(router.routes()).use(router.allowedMethods())
}
