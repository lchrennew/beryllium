import mime from 'mime'
import path from 'path'
import {
  createBlobReadStream,
  determineRefPathName,
  isCheckedOut,
  NotFoundError,
  resolveBlob
} from '../core/git'
import { resolveRepositoryPath } from '../core/utils'

export default options =>
  /**
   * Koa middleware handling raw content requests
   */
  [
    async (ctx, next) => {
      let { request: req, response: res } = ctx

      let { owner, repo: repoName, ref: refName, path: fpath } = ctx.params

      let repPath = resolveRepositoryPath(options, owner, repoName)
        // temporary fix until isomorphic git can handle windows paths
        // see https://github.com/isomorphic-git/isomorphic-git/issues/783
        .replace(/\\/g, '/')

      // issue: #53: handle branch names containing '/' (e.g. 'foo/bar')
      const parsed = await determineRefPathName(repPath, `${ctx.params.ref}/${ctx.params.path}`)
      if (parsed) {
        refName = parsed.ref
        fpath = parsed.pathName
      }

      // issue #68: lenient handling of redundant slashes in path
      fpath = path.normalize(fpath)
        // temporary fix until isomorphic git can handle windows paths
        // see https://github.com/isomorphic-git/isomorphic-git/issues/783
        .replace(/\\/g, '/')
        // remove leading slash
        .replace(/^\/+/, '')

      ctx.store = {
        owner,
        repoName,
        refName,
        fpath,
        repPath,
      }
      await next()
    },

    async (ctx, next) => {
      const { refName, fpath, repPath, } = ctx.store
      if (options.onRawRequest && typeof options.onRawRequest === 'function') {
        try {
          options.onRawRequest({
            req: ctx.request,
            repoPath: path.normalize(repPath),
            filePath: path.normalize(fpath),
            ref: refName,
          })
        } catch {
          // ignore errors from listener
        }
      }
      await next()
    },

    async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        // TODO: use generic errors
        if (err instanceof NotFoundError) {
          options.logger.debug(`[rawHandler] resource not found: ${err.message}`)
          ctx.status = 404
          ctx.body = 'not found.'
        } else {
          options.logger.debug(`[rawHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
          ctx.status = err.statusCode || err.status || 500
          ctx.body = err.message
        }
      }
    },

    async (ctx, next) => {
      const { refName, fpath, repPath, } = ctx.store

      // project-helix/#187: serve modified content only if the requested ref is currently checked out
      const serveUncommitted = await isCheckedOut(repPath, refName)
      const oid = await resolveBlob(repPath, refName, fpath, serveUncommitted)

      const mimeType = mime.getType(fpath) || 'text/plain'
      ctx.status = 200
      ctx.type = mimeType
      ctx.etag = oid
      ctx.set({
        // TODO: review cache-control header
        'Cache-Control': 'max-age=0, private, must-revalidate',
      })

      ctx.body = await createBlobReadStream(repPath, oid)
    },
  ]
