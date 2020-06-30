import { collectTreeEntries, getObject, NotFoundError, resolveTree } from './git';


import { resolveRepositoryPath } from './utils';

/**
 * Export the api handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
export default options =>
  /**
   * Express middleware handling Git API Blob requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/git/trees/#get-a-tree-recursively
   */
  async (ctx, next) => {
    // GET /repos/:owner/:repo/git/trees/:ref_or_sha?recursive
    const { owner, repo: repoName, ref_or_sha: refOrSha } = ctx.params
    const recursive = !!ctx.query.recursive
    const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host

    const repPath = resolveRepositoryPath(options, owner, repoName)

    const dirEntryToJson = async ({ oid: sha, type, path, mode, }) => ({
      path,
      mode,
      type,
      sha,
      url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
    })

    const fileEntryToJson = async ({oid: sha, type, path, mode,}) => {
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

    const treeEntriesToJson = async (tree, deep) => {
      const result = []
      await collectTreeEntries(repPath, tree, result, '', deep)
      return Promise.all(result.map(async (entry) => {
        /* eslint arrow-body-style: "off" */
        return entry.type === 'blob'
          ? fileEntryToJson(entry) : dirEntryToJson(entry)
      }))
    }

    try {
      const { oid: sha, object: tree } = await resolveTree(repPath, refOrSha)
      ctx.body = {
        sha,
        url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${sha}`,
        tree: await treeEntriesToJson(tree, recursive),
        truncated: false,
      }
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
        throw err
      }
    }
  }
