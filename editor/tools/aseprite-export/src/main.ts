/**
 * npm run art：用 Aseprite CLI 把 art/ 批次匯出到 content/（STUDIO_SPEC §2）。
 *
 * 用法（在 editor/ 執行）：
 *   npm run art [-- --force] [--dry-run] [--project <專案根目錄>]
 *   npm run art:watch          監看 art/，存檔後自動匯出
 * Aseprite 執行檔路徑由環境變數 ASEPRITE_PATH 指定。
 */
import { execFile } from 'node:child_process';
import { watch } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { argValue, findProjectRoot, hasFlag } from '../../common/nodeFs';
import { asepriteArgs, fixSheetJson, planJob } from './plan';
import type { ArtJob } from './plan';

const run = promisify(execFile);

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

const mtime = async (p: string) => (await stat(p).catch(() => null))?.mtimeMs ?? 0;

async function upToDate(root: string, job: ArtJob): Promise<boolean> {
  const src = await mtime(join(root, job.source));
  const outs = [job.png, ...(job.data ? [job.data] : [])];
  for (const o of outs) if ((await mtime(join(root, o))) < src) return false;
  return true;
}

async function exportJob(root: string, job: ArtJob, opts: { dryRun: boolean; aseprite: string | undefined }): Promise<void> {
  const abs = (p: string) => join(root, p);
  if (job.kind === 'normalMap') {
    if (opts.dryRun) return console.log(`  copy ${job.source} → ${job.png}`);
    await mkdir(dirname(abs(job.png)), { recursive: true });
    await copyFile(abs(job.source), abs(job.png));
    return;
  }
  if (!opts.aseprite) throw new Error('沒有設定環境變數 ASEPRITE_PATH（Aseprite 執行檔路徑）');
  const layers = opts.dryRun
    ? []
    : (await run(opts.aseprite, ['-b', '--list-layers', job.source], { cwd: root })).stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
  const args = asepriteArgs(job, layers);
  if (opts.dryRun) return console.log(`  ${opts.aseprite} ${args.join(' ')}`);
  await mkdir(dirname(abs(job.png)), { recursive: true });
  await run(opts.aseprite, args, { cwd: root });
  if (job.data) await writeFile(abs(job.data), fixSheetJson(await readFile(abs(job.data), 'utf8'), job.png));
}

async function exportAll(root: string, opts: { force: boolean; dryRun: boolean; aseprite: string | undefined; only?: string[] }) {
  const files = opts.only ?? (await listFiles(join(root, 'art'))).map((f) => relative(root, f).split(sep).join('/'));
  const jobs = files.map(planJob).filter((j): j is ArtJob => j !== null);
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    if (!opts.force && !opts.dryRun && (await upToDate(root, job))) continue;
    process.stdout.write(`${job.source} → ${job.png}${job.data ? ` + ${job.data.split('/').pop()}` : ''}\n`);
    try {
      await exportJob(root, job, opts);
      done++;
    } catch (error) {
      failed++;
      console.error(`  ✖ ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`匯出 ${done} 個${failed ? `，失敗 ${failed} 個` : ''}（共 ${jobs.length} 個素材${opts.force ? '' : '，未變更的略過'}）`);
  return failed;
}

async function main() {
  const root = argValue('project') ?? (await findProjectRoot());
  const opts = { force: hasFlag('force'), dryRun: hasFlag('dry-run'), aseprite: process.env.ASEPRITE_PATH };
  const failed = await exportAll(root, opts);
  if (!hasFlag('watch')) {
    if (failed) process.exitCode = 1;
    return;
  }
  console.log('監看 art/ 中…（Ctrl+C 結束）');
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(join(root, 'art'), { recursive: true }, (_event, name) => {
    if (!name) return;
    const rel = `art/${String(name).split(sep).join('/')}`;
    if (!planJob(rel)) return;
    pending.add(rel);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const only = [...pending];
      pending.clear();
      void exportAll(root, { ...opts, only });
    }, 300);
  });
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
