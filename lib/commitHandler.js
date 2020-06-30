import crypto from 'crypto'
import { commitLog, NotFoundError } from './git'
import { resolveRepositoryPath } from './utils'

const NOT_IMPL = 'not implemented'
const email2avatarUrl =
  email => `https://s.gravatar.com/avatar/${
    crypto.createHash('md5')
      .update(email)
      .digest('hex')
  }`

export default options =>
  [
    /**
     * Koa middleware handling Git API Commits requests
     * Only a small subset will be implemented
     * @see https://developer.github.com/v3/repos/commits/#list-commits-on-a-repository
     */

    async (ctx, next) => {
      // GET /repos/:owner/:repo/commits/?path=:path&sha=:sha
      const { owner, repo: repoName, } = ctx.params
      let { sha = 'master', path: fpath = '' } = ctx.query

      // TODO: support filtering (author, since, until)
      // const { author, since, until } = req.query;
      const host = ctx.mappedSubDomain ? `localhost:${options.listen[ctx.protocol].port}` : ctx.host

      ctx.store = {
        owner,
        repoName,
        sha,
        fpath,
        host,
      }
      await next()
    },

    async (ctx, next) => {
      const { fpath, } = ctx.store
      if (typeof fpath !== 'string') {
        ctx.status = 400
        ctx.body = 'Bad request'
      } else {
        // issue #247: lenient handling of redundant leading slashes in path
        // trim leading slash
        ctx.store.fpath = fpath.replace(/^\/+/, '')
        await next()
      }
    },

    async (ctx, next) => {
      const { owner, repoName, } = ctx.store
      ctx.store.repPath = resolveRepositoryPath(options, owner, repoName)
      await next()
    },

    async (ctx, next) => {
      try {
        await next()
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
          ctx.status = err.statusCode || err.code || 500
          ctx.body = err.message
        }
      }
    },

    async ctx => {
      let { owner, repoName, sha, fpath, repPath, host, } = ctx.store
      const commits = await commitLog(repPath, sha, fpath)
      ctx.body = commits.map(({ author, committer, message, oid, parent, tree }) => ({
        sha: oid,
        node_id: NOT_IMPL,
        commit: {
          author: {
            name: author.name,
            email: author.email,
            date: new Date(author.timestamp * 1000).toISOString(),
          },
          committer: {
            name: committer.name,
            email: committer.email,
            date: new Date(committer.timestamp * 1000).toISOString(),
          },
          message: message,
          tree: {
            sha: tree,
            url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/trees/${tree}`,
          },
          url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/git/commits/${oid}`,
          comment_count: 0,
          verification: {
            verified: false,
            reason: NOT_IMPL,
            signature: NOT_IMPL,
            payload: NOT_IMPL,
          },
        },
        // TODO
        url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${oid}`,
        html_url: `${ctx.protocol}://${host}/repos/${owner}/${repoName}/commit/${oid}`,
        comments_url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${oid}/comments`,
        author: {
          avatar_url: email2avatarUrl(author.email),
          gravatar_id: '',
          // TODO
        },
        committer: {
          avatar_url: email2avatarUrl(committer.email),
          gravatar_id: '',
          // TODO
        },
        parents: parent.map(oid => ({
          sha: oid,
          url: `${ctx.protocol}://${host}/api/repos/${owner}/${repoName}/commits/${oid}`,
          html_url: `${ctx.protocol}://${host}/repos/${owner}/${repoName}/commit/${oid}`,
        })),
      }))
    },
  ]
