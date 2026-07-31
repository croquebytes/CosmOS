import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = import.meta.dirname;

function copyRuntimeAssets() {
    return {
        name: 'copy-cosmos-runtime-assets',
        closeBundle() {
            const outputDir = resolve(rootDir, 'dist');
            mkdirSync(outputDir, { recursive: true });

            cpSync(resolve(rootDir, 'js'), resolve(outputDir, 'js'), { recursive: true });

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

export default defineConfig({
    plugins: [copyRuntimeAssets()]
});
