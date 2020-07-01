import fs from 'fs'

import git from 'isomorphic-git'
import path from 'path'

import { getObject, NotFoundError, resolveCommit } from './git'

import { resolveRepositoryPath } from './utils'

export default options =>
  /**
   * Koa middleware handling Git API Contents requests
   * Only a small subset will be implemented
   * @see https://developer.github.com/v3/repos/contents/#get-contents
   */
  [
    // GET /repos/:owner/:repo/contents/:path?ref=:ref
    async (ctx, next) => {
      let { owner, repo: repoName, path: fpath = '' } = ctx.params
      const refName = ctx.query.ref || 'master'
      const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host

      // issue #247: lenient handling of redundant leading slashes in path
      // trim leading slash
      fpath = fpath.replace(/^\/+/, '')
      const repPath = resolveRepositoryPath(options, owner, repoName)
      ctx.store = {
        owner,
        repoName,
        fpath,
        refName,
        host,
        repPath,
      }
      await next()
    },
    async (ctx, next) => {
      try {
        await next()
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
          ctx.status = 500
          ctx.body = err.message
        }
      }
    },

    async (ctx, next) => {
      const { owner, repoName, fpath, refName, host, repPath, } = ctx.store

      const dirEntryToJson = async (sha, dirPath) => ({
        type: 'dir',
        name: path.basename(dirPath),
        path: dirPath,
        sha,
        size: 0,
        url: `${ctx.protocol}://${host}${ctx.path}?ref=${refName}`,
        html_url: `${ctx.protocol}://${host}/${owner}/${repoName}/tree/${refName}/${dirPath}`,
        git_url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
        download_url: null,
        _links: {
          self: `${ctx.protocol}://${host}${ctx.path}?ref=${refName}`,
          git: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
          html: `${ctx.protocol}://${host}/${owner}/${repoName}/tree/${refName}/${dirPath}`,
        },
      })

      const fileEntryToJson = async (sha, content, filePath, withContent) => ({
        type: 'file',
        name: path.basename(filePath),
        path: filePath,
        sha,
        size: content.length,
        url: `${ctx.protocol}://${host}${ctx.path}?ref=${refName}`,
        html_url: `${ctx.protocol}://${host}/${owner}/${repoName}/blob/${refName}/${filePath}`,
        git_url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`,
        download_url: `${ctx.protocol}://${host}/raw/${owner}/${repoName}/${refName}/${filePath}`,
        _links: {
          self: `${ctx.protocol}://${host}${ctx.path}?ref=${refName}`,
          git: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`,
          html: `${ctx.protocol}://${host}/${owner}/${repoName}/blob/${refName}/${filePath}`,
        },
        ...(
          withContent ?
            {
              content: `${content.toString('base64')}\n`,
              encoding: 'base64'
            } :
            undefined
        )
      })

      const treeEntriesToJson = async (entries, dirPath) => Promise.all(entries.map(async (entry) => {
        if (entry.type === 'blob') {
          const { object: content } = await getObject(repPath, entry.oid)
          return fileEntryToJson(entry.oid, content, path.join(dirPath, entry.path), false)
        }
        return dirEntryToJson(entry.oid, path.join(dirPath, entry.path))
      }))

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
    },
  ]
