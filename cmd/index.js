const asar = require('@electron/asar');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const extractAppArchive = (_archivePath, outputPath, overwrite = false) => {
  const currentPath = process.cwd();
  const archivePath = path.join(currentPath, _archivePath);
  const destPath = path.join(currentPath, outputPath);
  if (!fs.existsSync(archivePath)) {
    throw new Error('app.asar is not supported yet.');
  }
  if (fs.existsSync(destPath) && !overwrite) {
    throw new Error(`${destPath} already exists. Please remove it or use the --overwrite option.`);
  }
  asar.extractAll(archivePath, destPath);
};

const cmdSetup = () => {
  program
    .option('-a, --archive <archivePath>', 'Path to the app.asar file to extract')
    .option('-o, --output <outputPath>', 'Path to the directory where the extracted files will be saved')
    .option('-w, --overwrite', 'Overwrite existing files in the output directory')
    .parse();

    const { archive = '', output = '', overwrite } = program.opts();
    extractAppArchive(archive, output, overwrite);
};

void cmdSetup();
