import Archiver from 'archiver'
import fse from 'fs-extra'
import Ignore from 'ignore'
import klaw from 'klaw'

import { join as joinPaths, relative as relativePaths } from 'path'
import {
  collectTreeEntries,
  createBlobReadStream,
  getObject,
  isCheckedOut,
  resolveCommit
} from './git'
import { resolveRepositoryPath } from './utils'

const CACHE_DIR = './tmp'

/**
 * Serializes the specified git tree as an archive (zip/tgz).
 *
 * @param {string} repPath git repository path
 * @param {object} tree git tree to process
 * @param {object} archiver Archiver instance
 * @returns {Promise<stream.Readable>} readable stream of archive
 */
const archiveGitTree = async (repPath, tree, archive) => {
  // recursively collect all entries (blobs and trees)
  const allEntries = await collectTreeEntries(repPath, tree, [], '', true)

  const process = async ({ type, oid, path }) => {
    if (type === 'tree' || type === 'commit') {
      // directory or submodule
      archive.append(null, { name: `${path}/` })
    } else {
      // blob
      const stream = await createBlobReadStream(repPath, oid)
      archive.append(stream, { name: path })
    }
  }

  for (const entry of allEntries) {
    await process(entry)
  }
  return archive
}

/**
 * Recursively collects all directory entries (files and directories).
 *
 * @param {string} dirPath directory path
 * @param {Array<{{path: string, stats: fs.Stats}}>} allEntries array where entries will be added
 * @returns {Promise<Array<{{path: string, stats: fs.Stats}}>>} collected entries
 */
const collectFSEntries = async (dirPath, allEntries) => {
  // apply .gitignore rules
  const ignore = Ignore()
  const ignoreFilePath = joinPaths(dirPath, '.gitignore')
  if (await fse.pathExists(ignoreFilePath)) {
    const data = await fse.readFile(ignoreFilePath)
    ignore.add(data.toString())
  }
  ignore.add('.git')

  const filterIgnored = (item) => !ignore.ignores(relativePaths(dirPath, item))

  return new Promise((resolve, reject) => {
    klaw(dirPath, { filter: filterIgnored })
      .on('readable', function onAvail() {
        let item = this.read()
        while (item) {
          allEntries.push(item)
          item = this.read()
        }
      })
      .on('error', err => reject(err))
      .on('end', () => resolve(allEntries))
  })
}

/**
 * Serializes the specified git working directory as an archive (zip/tgz).
 *
 * @param {string} dirPath working directory
 * @param {object} archiver Archiver instance
 * @returns {Promise<stream.Readable>} readable stream of archive
 */
const archiveWorkingDir = async (dirPath, archive) => {
  // recursively collect all entries (files and directories)
  const allEntries = await collectFSEntries(dirPath, [])

  const process = (entry) => {
    const p = relativePaths(dirPath, entry.path)
    if (p.length) {
      if (entry.stats.isDirectory()) {
        archive.append(null, { name: `${p}/` })
      } else {
        archive.append(fse.createReadStream(entry.path), { name: p })
      }
    }
  }

  for (const entry of allEntries) {
    await process(entry)
  }
  return archive
}

/**
 * Export the archive handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @param {string} archiveFormat 'zip' or 'tar.gz'
 * @returns {function(*, *, *)} handler function
 */
export default (options, archiveFormat) =>
  /**
   * Express middleware handling GitHub 'codeload' archive requests
   *
   * @param ctx {Context} koa Context
   * @param {callback} next next middleware in chain
   *
   * @see https://developer.github.com/v3/repos/contents/#get-archive-link
   */
  async (ctx, next) => {
    // GET /:owner/:repo/:archive_format/:ref
    const { owner, repo: repoName, ref: refName } = ctx.params

    const repPath = resolveRepositoryPath(options, owner, repoName)

    // project-helix/#187: serve modified content only if the requested ref is currently checked out
    const serveUncommitted = await isCheckedOut(repPath, refName)

    let commitSha
    let archiveFileName
    let archiveFilePath

    try {
      commitSha = await resolveCommit(repPath, refName)
      const { object: commit } = await getObject(repPath, commitSha)
      const { object: tree } = await getObject(repPath, commit.tree)

      let archiveStream
      archiveFileName = `${owner}-${repoName}-${serveUncommitted ? 'SNAPSHOT' : commitSha}${archiveFormat === 'zip' ? '.zip' : '.tgz'}`
      archiveFilePath = joinPaths(CACHE_DIR, archiveFileName)
      await fse.ensureDir(CACHE_DIR)

      // check cache
      if (!serveUncommitted && await fse.pathExists(archiveFilePath)) {
        // no need to build archive, use cached archive file
        archiveStream = fse.createReadStream(archiveFilePath) // lgtm [js/path-injection]
      } else {
        // build archive
        let archive
        if (archiveFormat === 'zip') {
          // zip
          archive = new Archiver('zip', {
            zlib: { level: 9 }, // compression level
          })
        } else {
          // tar.gz
          archive = new Archiver('tar', {
            gzip: true,
            gzipOptions: {
              level: 9, // compression level
            },
          })
        }
        if (serveUncommitted) {
          // don't cache
          archive = await archiveWorkingDir(repPath, archive)
        } else {
          archive = await archiveGitTree(repPath, tree, archive)
        }

        if (serveUncommitted) {
          // don't cache
          archive.finalize()
          archiveStream = archive
        } else {
          archiveStream = await new Promise((resolve, reject) => {
            // cache archive file
            archive.pipe(fse.createWriteStream(archiveFilePath)) // lgtm [js/path-injection]
              .on('finish', () => resolve(fse.createReadStream(archiveFilePath))) // lgtm [js/path-injection]
              .on('error', err => reject(err))
            archive.finalize()
          })
        }
      }

      const mimeType = archiveFormat === 'zip' ? 'application/zip' : 'application/x-gzip'
      ctx.status = 200
      ctx.type = mimeType
      ctx.set({'Content-Disposition': `attachment; filename=${archiveFileName}`,})
      ctx.body = archiveStream
    } catch (err) {
      options.logger.debug(`[archiveHandler] code: ${err.code} message: ${err.message} stack: ${err.stack}`)
      ctx.status=500
      ctx.body  = err.message
    }
  }
