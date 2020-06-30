import path from 'path';

import git from 'isomorphic-git';

import fs from 'fs';

import { getObject, NotFoundError, resolveCommit } from './git';

import { resolveRepositoryPath } from './utils';

/**
 * Export the api handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
export default options =>
  /**
   * Express middleware handling Git API Contents requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-contents
   */
  async (ctx, next) => {
    // GET /repos/:owner/:repo/contents/:path?ref=:ref
    const { owner } = ctx.params
    const repoName = ctx.params.repo
    const refName = ctx.query.ref || 'master'
    let fpath = ctx.params.path || ''

    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1)
    }

    const repPath = resolveRepositoryPath(options, owner, repoName)

    const dirEntryToJson = async (sha, dirPath) => {
      const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host
      const url = `${ctx.protocol}://${host}${ctx.path}?ref=${refName}`
      const gitUrl = `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`
      const htmlUrl = `${ctx.protocol}://${host}/${owner}/${repoName}/tree/${refName}/${dirPath}`
      return {
        type: 'dir',
        name: path.basename(dirPath),
        path: dirPath,
        sha,
        size: 0,
        url,
        html_url: htmlUrl,
        git_url: gitUrl,
        download_url: null,
        _links: {
          self: url,
          git: gitUrl,
          html: htmlUrl,
        },
      }
    }

    const fileEntryToJson = async (sha, content, filePath, withContent) => {
      const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host
      const url = `${ctx.protocol}://${host}${ctx.path}?ref=${refName}`
      const gitUrl = `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`
      const htmlUrl = `${ctx.protocol}://${host}/${owner}/${repoName}/blob/${refName}/${filePath}`
      const rawlUrl = `${ctx.protocol}://${host}/raw/${owner}/${repoName}/${refName}/${filePath}`
      const result = {
        type: 'file',
        name: path.basename(filePath),
        path: filePath,
        sha,
        size: content.length,
        url,
        html_url: htmlUrl,
        git_url: gitUrl,
        download_url: rawlUrl,
        _links: {
          self: url,
          git: gitUrl,
          html: htmlUrl,
        },
      }
      if (withContent) {
        result.content = `${content.toString('base64')}\n`
        result.encoding = 'base64'
      }
      return result
    }

    const treeEntriesToJson = async (entries, dirPath) => Promise.all(entries.map(async (entry) => {
      if (entry.type === 'blob') {
        const { object: content } = await getObject(repPath, entry.oid)
        return fileEntryToJson(entry.oid, content, path.join(dirPath, entry.path), false)
      }
      return dirEntryToJson(entry.oid, path.join(dirPath, entry.path))
    }))

    try {
      const commitOid = await resolveCommit(repPath, refName)
      const { type, oid, object } = await git.readObject({
        fs,
        dir: repPath,
        oid: commitOid,
        filepath: fpath,
      })

      ctx.body = (type === 'blob' ?
        await fileEntryToJson(oid, object, fpath, true) :
        await treeEntriesToJson(object, fpath))
    } catch (err) {
      // TODO: use generic errors
      if (err instanceof NotFoundError) {
        options.logger.debug(`[contentHandler] resource not found: ${err.message}`)
        ctx.status = 404
        ctx.body = {
          message: `No commit found for the ref ${refName}`,
          documentation_url: 'https://developer.github.com/v3/repos/contents/',
        }
      } else {
        options.logger.debug(`[contentHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
        throw err
      }
    }
  }
