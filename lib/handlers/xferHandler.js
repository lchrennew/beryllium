'use strict'

import { spawn } from 'child_process'
import backend from 'git-http-backend'
import zlib from 'zlib'

import { resolveRepositoryPath } from '../core/utils'

export default options =>
  [
    /**
     * Koa middleware handling Git (Smart) Transfer Protocol requests
     * @see https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols
     * @see https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt
     */
    async ctx => {
      const { owner, repo } = ctx.params

      const repPath = resolveRepositoryPath(options, owner, repo)
      const reqStream = ctx.get('content-encoding') === 'gzip' ? ctx.req.pipe(zlib.createGunzip()) : ctx.req
      ctx.body = reqStream.pipe(backend(ctx.originalUrl, (err, service) => {
        if (err) {
          options.logger.error(err)
          return
        }

        ctx.type = service.type
        options.logger.info(service.action, repo, service.fields)

        const ps = spawn(service.cmd, service.args.concat(repPath))
        ps.stdout.pipe(service.createStream())
          .pipe(ps.stdin)
      }))
    },
  ]
