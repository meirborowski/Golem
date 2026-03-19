# Golem CLI

Golem CLI is a provider-agnostic command-line interface (CLI) AI coding assistant designed to help developers write, understand, and edit code efficiently. It leverages various AI models to provide insightful code suggestions and assistance directly within the terminal.

## Features

- **Provider-Agnostic**: Supports multiple AI providers like Anthropic, Google, and OpenAI.
- **Code Assistance**: Offers code completion, debugging tips, and refactoring suggestions.
- **Terminal Integration**: Seamlessly integrates into your terminal environment.
- **Customizable**: Easily extendable to support additional AI providers and custom functionalities.

## Prerequisites

- Node.js version 20.0.0 or higher

## Installation

To install Golem CLI, run the following command:

```bash
npm install -g golem-cli
```

## Usage

To start using Golem CLI, simply type the following command in your terminal:

```bash
golem
```

## Scripts

- `dev`: Starts the development server.
- `build`: Compiles the TypeScript code into JavaScript.
- `start`: Runs the compiled JavaScript code.
- `test`: Executes tests using Vitest.
- `lint`: Checks the code formatting with Prettier.
- `format`: Formats the code using Prettier.
- `typecheck`: Checks TypeScript types without emitting files.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to enhance the functionality and usability of Golem CLI.

## License

This project is licensed under the MIT License.

## Keywords

- AI
- CLI
- Coding Assistant
- LLM
- Terminal

## Dependencies

- `@ai-sdk/anthropic`
- `@ai-sdk/google`
- `@ai-sdk/openai`
- `ai`
- `chalk`
- `cli-highlight`
- `fast-glob`
- `ink`
- `ink-spinner`
- `ink-text-input`
- `meow`
- `ollama-ai-provider`
- `react`
- `zod`

## Dev Dependencies

- `@types/node`
- `@types/react`
- `ink-testing-library`
- `prettier`
- `tsx`
- `typescript`
- `vitest`

---

Happy coding with Golem CLI!
