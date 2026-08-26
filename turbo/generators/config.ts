import type { PlopTypes } from '@turbo/gen';

export default function generators(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('feature', {
    description: 'Create a web feature and its unit-test shell',
    prompts: [{ type: 'input', name: 'name', message: 'Feature name:' }],
    actions: [
      {
        type: 'add',
        path: 'apps/web/src/features/{{kebabCase name}}/index.ts',
        template: 'export const {{camelCase name}}Feature = true;\n',
      },
      {
        type: 'add',
        path: 'apps/web/src/features/{{kebabCase name}}/index.test.ts',
        template:
          "import { describe, expect, test } from 'vitest';\n\nimport { {{camelCase name}}Feature } from './index';\n\ndescribe('{{kebabCase name}}', () => {\n  test('loads', () => expect({{camelCase name}}Feature).toBe(true));\n});\n",
      },
    ],
  });
  plop.setGenerator('nest-module', {
    description: 'Create an API Nest module, service, and unit-test shell',
    prompts: [{ type: 'input', name: 'name', message: 'Module name:' }],
    actions: [
      {
        type: 'add',
        path: 'apps/api/src/{{kebabCase name}}/{{kebabCase name}}.module.ts',
        template:
          "import { Module } from '@nestjs/common';\n\nimport { {{pascalCase name}}Service } from './{{kebabCase name}}.service';\n\n@Module({ providers: [{{pascalCase name}}Service], exports: [{{pascalCase name}}Service] })\nexport class {{pascalCase name}}Module {}\n",
      },
      {
        type: 'add',
        path: 'apps/api/src/{{kebabCase name}}/{{kebabCase name}}.service.ts',
        template:
          "import { Injectable } from '@nestjs/common';\n\n@Injectable()\nexport class {{pascalCase name}}Service {}\n",
      },
      {
        type: 'add',
        path: 'apps/api/src/{{kebabCase name}}/{{kebabCase name}}.service.test.ts',
        template:
          "import { describe, expect, test } from 'vitest';\n\nimport { {{pascalCase name}}Service } from './{{kebabCase name}}.service';\n\ndescribe('{{pascalCase name}}Service', () => {\n  test('constructs', () => expect(new {{pascalCase name}}Service()).toBeInstanceOf({{pascalCase name}}Service));\n});\n",
      },
    ],
  });
  plop.setGenerator('workspace-package', {
    description: 'Create a typed internal workspace package',
    prompts: [{ type: 'input', name: 'name', message: 'Package name:' }],
    actions: [
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/package.json',
        template:
          '{"name":"@ecosuitability/{{kebabCase name}}","private":true,"version":"0.0.0","type":"module","exports":{".":"./src/index.ts"}}\n',
      },
      { type: 'add', path: 'packages/{{kebabCase name}}/src/index.ts', template: 'export {};\n' },
      {
        type: 'add',
        path: 'packages/{{kebabCase name}}/README.md',
        template: '# @ecosuitability/{{kebabCase name}}\n',
      },
    ],
  });
}
