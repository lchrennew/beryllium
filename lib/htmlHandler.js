import escape from 'escape-html'

import fs from 'fs'

import git from 'isomorphic-git'

import { determineRefPathName, resolveCommit } from './git'

import { resolveRepositoryPath } from './utils'

/**
 * Export the html handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} urlType 'root', 'tree' (directory) or 'blob' (file)
 * @returns {function(*, *, *)} handler function
 */
export default (options, urlType) =>
  /**
   * Express middleware handling html requests
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   */
  async (ctx, next) => {
    const { owner } = ctx.params
    const repoName = ctx.params.repo
    let refName = ctx.params.ref || 'master'
    let fpath = ctx.params.path || ''

    const repPath = resolveRepositoryPath(options, owner, repoName)

    // issue: #53: handle branch names containing '/' (e.g. 'foo/bar')
    const parsed = await determineRefPathName(repPath, `${ctx.params.ref}/${fpath}`)
    if (parsed) {
      refName = parsed.ref
      fpath = parsed.pathName
    }

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1)
    }

    // set response content type
    ctx.type = 'text/html'

    try {
      const commitOid = await resolveCommit(repPath, refName)
      const blobOrTree = await git.readObject({
        fs,
        dir: repPath,
        oid: commitOid,
        filepath: fpath,
      })
        .catch(() => null)
      if (!blobOrTree) {
        if (!fpath.length && urlType === 'tree') {
          // 'tree' view
          ctx.body = `<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<p>tree view not implemented yet.</body></html>`
        } else {
          ctx.status = 404
          ctx.body = `not found: ${escape(fpath)}`
        }
        return
      }

      const { type } = blobOrTree
      if (!fpath.length && type === 'tree' && urlType === 'root') {
        // 'root' view
        ctx.body = `<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<p>root view not implemented yet.</body></html>`
      } else if (type === 'tree' && urlType === 'tree') {
        // directory view
        ctx.body = `<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<br>path: ${escape(fpath)}<p>directory view not implemented yet.</body></html>`
      } else if (type === 'blob' && urlType === 'blob') {
        // single file view
        ctx.body = `<!DOCTYPE html><html><body>owner: ${escape(owner)}<br>repo: ${escape(repoName)}<br>ref: ${escape(refName)}<br>path: ${escape(fpath)}<p>file view not implemented yet.</body></html>`
      } else {
        ctx.status = 404
        ctx.body = `not found: ${escape(fpath)}`
      }
    } catch (err) {
      options.logger.debug(`[htmlHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
      ctx.status = 500
      ctx.body = err.message
    }
  }
