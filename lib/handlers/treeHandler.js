import { collectTreeEntries, getObject, NotFoundError, resolveTree } from '../core/git'

import { resolveRepositoryPath } from '../core/utils'

export default options =>
  /**
   * Koa middleware handling Git API Blob requests
   * Only a small subset will be implemented
   * @see https://developer.github.com/v3/git/trees/#get-a-tree-recursively
   */
  [
    async (ctx, next) => {
      // GET /repos/:owner/:repo/git/trees/:ref_or_sha?recursive
      const { owner, repo: repoName, ref_or_sha: refOrSha } = ctx.params
      const recursive = !!ctx.query.recursive
      const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host
      const repPath = resolveRepositoryPath(options, owner, repoName)
      ctx.store = {
        owner,
        repoName,
        refOrSha,
        recursive,
        host,
        repPath
      }

      await next()
    },

    async (ctx, next) => {
      try {
        await next()
      } catch (err) {
        // TODO: use generic errors
        if (err instanceof NotFoundError) {
          options.logger.debug(`[treeHandler] resource not found: ${err.message}`)
          ctx.status = 404
          ctx.body = {
            message: 'Not Found',
            documentation_url: 'https://developer.github.com/v3/git/trees/#get-a-tree',
          }
        } else {
          options.logger.debug(`[treeHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
          ctx.status = err.statusCode || err.status || 500
          ctx.body = err.message
        }
      }
    },

    async ctx => {
      const { owner, repoName, refOrSha, recursive, host, repPath } = ctx.store

      const treeEntriesToJson = async (tree, deep) => {
        const dirEntryToJson =
          ({ oid: sha, type, path, mode, }) => ({
            path,
            mode,
            type,
            sha,
            url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
          })

        const fileEntryToJson =
          async ({ oid: sha, type, path, mode, }) => {
            const { object: content } = await getObject(repPath, sha)

            return {
              path,
              mode,
              type,
              sha,
              size: content.length,
              url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/blobs/${sha}`,
            }
          }

        const result = []
        await collectTreeEntries(repPath, tree, result, '', deep)
        return Promise.all(result.map(
          async entry =>
            entry.type === 'blob' ?
              fileEntryToJson(entry) :
              dirEntryToJson(entry)))
      }

      const { oid: sha, object: tree } = await resolveTree(repPath, refOrSha)
      ctx.body = {
        sha,
        url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
        tree: await treeEntriesToJson(tree, recursive),
        truncated: false,
      }
    },
  ]

