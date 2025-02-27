# Inspect.dev (Learning Edition)

[中文文档](https://github.com/JsonLee12138/inspect.dev/blob/main/README.md)

This project is intended for learning purposes only. Please do not use it for commercial purposes. Please support the official [Inspect.dev](https://inspect.dev/).

## Version

The current version is 1.0.9. If a new version is required in the future, simply replace the files in the `asar` directory with the new ones and rename it to `app.asar`. Then, execute `npm run extract:asar` to run and package the project.

## Running the Project

```bash
npm install
npm run dev
```

## Packaging the Project

```bash
# Package for macOS
npm run build:mac
# Package for Windows
npm run build:win
```

## Known Issues

- The application takes a long time to start up after packaging.
