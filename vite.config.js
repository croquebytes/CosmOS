import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = import.meta.dirname;

/* Files that exist for testers and must never ship. `npm run build:release`
   (vite build --mode release) leaves them out of the output and takes their
   <script> tags out of index.html; tests/release-build.mjs holds the line. */
const DEV_ONLY_SCRIPTS = ['js/devtools.js'];
const devOnlyPaths = new Set(DEV_ONLY_SCRIPTS.map((file) => resolve(rootDir, file)));

function copyRuntimeAssets({ release }) {
    let outputDir = resolve(rootDir, 'dist');
    return {
        name: 'copy-cosmos-runtime-assets',
        configResolved(config) {
            outputDir = resolve(config.root, config.build.outDir);
        },
        closeBundle() {
            mkdirSync(outputDir, { recursive: true });

            cpSync(resolve(rootDir, 'js'), resolve(outputDir, 'js'), {
                recursive: true,
                filter: (source) => !(release && devOnlyPaths.has(resolve(source)))
            });

            // The classic scripts request art by literal path at runtime, so
            // Vite never sees those references and cannot hash them. Copy the
            // runtime art across verbatim, minus the generation masters.
            const artSource = resolve(rootDir, 'assets');
            if (existsSync(artSource)) {
                const excluded = new Set([
                    resolve(artSource, 'src'),
                    resolve(artSource, 'visual-probes')
                ]);
                cpSync(artSource, resolve(outputDir, 'assets'), {
                    recursive: true,
                    filter: (source) => !excluded.has(resolve(source))
                });
            }

            const documentSource = resolve(rootDir, 'docs/CosmOS_Content_Pack/docs');
            if (existsSync(documentSource)) {
                cpSync(
                    documentSource,
                    resolve(outputDir, 'docs/CosmOS_Content_Pack/docs'),
                    { recursive: true }
                );
            }
        }
    };
}

function stripDevScripts({ release }) {
    return {
        name: 'strip-cosmos-dev-scripts',
        transformIndexHtml(html) {
            if (!release) return html;
            let out = html;
            for (const file of DEV_ONLY_SCRIPTS) {
                const tag = new RegExp(`[ \\t]*<script src="${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>\\r?\\n?`, 'g');
                out = out.replace(tag, '');
            }
            return out;
        }
    };
}

export default defineConfig(({ mode }) => {
    const release = mode === 'release';
    return {
        plugins: [copyRuntimeAssets({ release }), stripDevScripts({ release })]
    };
});
