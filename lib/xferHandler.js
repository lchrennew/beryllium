/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict'

import { spawn } from 'child_process'
import backend from 'git-http-backend'
import zlib from 'zlib'

import { resolveRepositoryPath } from './utils'

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
