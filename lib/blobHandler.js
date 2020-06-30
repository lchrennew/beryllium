import { getObject, NotFoundError } from './git';
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
   * @see https://developer.github.com/v3/git/blobs/#get-a-blob
   */
  async (ctx, next) => {
    // GET /repos/:owner/:repo/git/blobs/:file_sha
    const { owner, repo: repoName, file_sha: sha } = ctx.params
    const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host

    const repPath = resolveRepositoryPath(options, owner, repoName)

    if (sha.match(/[0-9a-f]/g).length !== 40) {
      // invalid sha format
      ctx.status = 422
      ctx.body = {
        message: 'The sha parameter must be exactly 40 characters and contain only [0-9a-f].',
        documentation_url: 'https://developer.github.com/v3/git/blobs/#get-a-blob',
      }
      return
    }

    try {
      const { object: content } = await getObject(repPath, sha)
      ctx.body = { sha, size: content.length, url: `${ctx.protocol}://${host}${ctx.path}`, content: `${content.toString('base64')}\n`, encoding: 'base64', }
    } catch (err) {
      // TODO: use generic errors
      if (err instanceof NotFoundError) {
        options.logger.debug(`[blobHandler] resource not found: ${err.message}`)
        ctx.status = 404
        ctx.body = {
          message: 'Not Found',
          documentation_url: 'https://developer.github.com/v3/git/blobs/#get-a-blob',
        }
      } else {
        options.logger.debug(`[blobHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
        throw err
      }
    }
  };
