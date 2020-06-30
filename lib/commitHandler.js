import crypto from 'crypto';
import { commitLog, NotFoundError } from './git';
import { resolveRepositoryPath } from './utils';

/**
 * Export the api handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
export default options =>
  /**
   * Express middleware handling Git API Commits requests
   *
   * Only a small subset will be implemented
   *
   * @param {Request} req Request object
   * @param {Response} res Response object
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository
   */
  async (ctx, next) => {
    // GET /repos/:owner/:repo/commits/?path=:path&sha=:sha
    const { owner, repo: repoName, } = ctx.params
    let {sha='master', path: fpath = ''} = ctx.query

    // TODO: support filtering (author, since, until)
    // const { author, since, until } = req.query;

    const repPath = resolveRepositoryPath(options, owner, repoName)

    if (typeof fpath !== 'string') {
      res.status(400)
        .send('Bad request')
      return
    }
    // issue #247: lenient handling of redundant leading slashes in path
    while (fpath.length && fpath[0] === '/') {
      // trim leading slash
      fpath = fpath.substr(1)
    }

    const NOT_IMPL = 'not implemented'

    function email2avatarUrl(email) {
      const hash = crypto.createHash('md5')
        .update(email)
        .digest('hex')
      return `https://s.gravatar.com/avatar/${hash}`
    }

    try {
      const commits = await commitLog(repPath, sha, fpath)
      const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host
      const result = []
      commits.forEach((commit) => {
        const parents = []
        commit.parent.forEach((oid) => parents.push({
          sha: oid,
          url: `${req.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${oid}`,
          html_url: `${req.protocol}://${host}/repos/${owner}/${repoName}/commit/${oid}`,
        }))
        result.push({
          sha: commit.oid,
          node_id: NOT_IMPL,
          commit: {
            author: {
              name: commit.author.name,
              email: commit.author.email,
              date: new Date(commit.author.timestamp * 1000).toISOString(),
            },
            committer: {
              name: commit.committer.name,
              email: commit.committer.email,
              date: new Date(commit.committer.timestamp * 1000).toISOString(),
            },
            message: commit.message,
            tree: {
              sha: commit.tree,
              url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${commit.tree}`,
            },
            url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/commits/${commit.oid}`,
            comment_count: 0,
            verification: {
              verified: false,
              reason: NOT_IMPL,
              signature: NOT_IMPL,
              payload: NOT_IMPL,
            },
          },
          // TODO
          url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${commit.oid}`,
          html_url: `${ctx.protocol}://${host}/repos/${owner}/${repoName}/commit/${commit.oid}`,
          comments_url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${commit.oid}/comments`,
          author: {
            avatar_url: email2avatarUrl(commit.author.email),
            gravatar_id: '',
            // TODO
          },
          committer: {
            avatar_url: email2avatarUrl(commit.committer.email),
            gravatar_id: '',
            // TODO
          },
          parents,
        })
      })
      ctx.body = result
    } catch (err) {
      // TODO: use generic errors
      if (err instanceof NotFoundError) {
        options.logger.debug(`[commitHandler] resource not found: ${err.message}`)
        ctx.status = 404
        ctx.body = {
          message: 'Not Found',
          documentation_url: 'https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository',
        }
      } else {
        options.logger.debug(`[commitHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
        throw err
      }
    }
  }
