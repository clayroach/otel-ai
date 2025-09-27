import React, { useRef, useCallback } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { useAppStore } from '../../store/appStore'

interface MonacoQueryEditorProps {
  value: string
  onChange: (value: string) => void
  onRunQuery?: () => void
  height?: string | number
  language?: string
}

export const MonacoQueryEditor: React.FC<MonacoQueryEditorProps> = ({
  value,
  onChange,
  onRunQuery,
  height = '400px',
  language = 'sql'
}) => {
  const { darkMode } = useAppStore()
  const editorRef = useRef<unknown>(null)

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor

      // Configure SQL language support
      monaco.languages.setLanguageConfiguration('sql', {
        comments: {
          lineComment: '--',
          blockComment: ['/*', '*/']
        },
        brackets: [
          ['{', '}'],
          ['[', ']'],
          ['(', ')']
        ],
        autoClosingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: '"', close: '"' },
          { open: "'", close: "'" }
        ],
        surroundingPairs: [
          { open: '{', close: '}' },
          { open: '[', close: ']' },
          { open: '(', close: ')' },
          { open: '"', close: '"' },
          { open: "'", close: "'" }
        ]
      })

      // Add ClickHouse-specific keywords
      monaco.languages.setMonarchTokensProvider('sql', {
        keywords: [
          'SELECT',
          'FROM',
          'WHERE',
          'ORDER',
          'BY',
          'GROUP',
          'HAVING',
          'LIMIT',
          'INSERT',
          'UPDATE',
          'DELETE',
          'CREATE',
          'ALTER',
          'DROP',
          'TABLE',
          'INDEX',
          'VIEW',
          'DATABASE',
          'SCHEMA',
          'PRIMARY',
          'KEY',
          'FOREIGN',
          'REFERENCES',
          'CONSTRAINT',
          'NULL',
          'NOT',
          'UNIQUE',
          'DEFAULT',
          'AND',
          'OR',
          'IN',
          'EXISTS',
          'BETWEEN',
          'LIKE',
          'IS',
          'AS',
          'ON',
          'INNER',
          'LEFT',
          'RIGHT',
          'FULL',
          'OUTER',
          'JOIN',
          'UNION',
          'ALL',
          'DISTINCT',
          'COUNT',
          'SUM',
          'AVG',
          'MAX',
          'MIN',
          'CASE',
          'WHEN',
          'THEN',
          'ELSE',
          'END',
          'IF',
          'WITH',
          // ClickHouse specific
          'MATERIALIZED',
          'ENGINE',
          'PARTITION',
          'SAMPLE',
          'SETTINGS',
          'PREWHERE',
          'FINAL',
          'ARRAY',
          'TUPLE',
          'NESTED',
          'CODEC',
          'toYYYYMM',
          'toStartOfMonth',
          'toStartOfDay',
          'toStartOfHour',
          'now',
          'today',
          'yesterday',
          'subtractHours',
          'subtractDays',
          'formatDateTime',
          'parseDateTimeBestEffort',
          'quantile',
          'uniq',
          'uniqCombined',
          'groupArray',
          'groupUniqArray'
        ],

        // ClickHouse data types
        typeKeywords: [
          'String',
          'FixedString',
          'UInt8',
          'UInt16',
          'UInt32',
          'UInt64',
          'Int8',
          'Int16',
          'Int32',
          'Int64',
          'Float32',
          'Float64',
          'Date',
          'DateTime',
          'DateTime64',
          'UUID',
          'IPv4',
          'IPv6',
          'Array',
          'Tuple',
          'Nullable',
          'LowCardinality',
          'Map',
          'AggregateFunction',
          'SimpleAggregateFunction'
        ],

        operators: [
          '=',
          '>',
          '<',
          '!',
          '~',
          '?',
          ':',
          '==',
          '<=',
          '>=',
          '!=',
          '&&',
          '||',
          '++',
          '--',
          '+',
          '-',
          '*',
          '/',
          '&',
          '|',
          '^',
          '%',
          '<<',
          '>>',
          '>>>',
          '+=',
          '-=',
          '*=',
          '/=',
          '&=',
          '|=',
          '^=',
          '%=',
          '<<=',
          '>>=',
          '>>>='
        ],

        symbols: /[=><!~?:&|+\-*/^%]+/,

        tokenizer: {
          root: [
            [
              /[a-zA-Z_$][\w$]*/,
              {
                cases: {
                  '@keywords': 'keyword',
                  '@typeKeywords': 'type',
                  '@default': 'identifier'
                }
              }
            ],
            [/[{}()[\]]/, '@brackets'],
            [
              /@symbols/,
              {
                cases: {
                  '@operators': 'operator',
                  '@default': ''
                }
              }
            ],
            [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/\d+/, 'number'],
            [/[;,.]/, 'delimiter'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/'/, { token: 'string.quote', bracket: '@open', next: '@string' }],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/"/, { token: 'string.quote', bracket: '@open', next: '@dblstring' }],
            [/--.*$/, 'comment'],
            [/\/\*/, 'comment', '@comment']
          ],

          comment: [
            [/[^/*]+/, 'comment'],
            [/\/\*/, 'comment', '@push'],
            [/\*\//, 'comment', '@pop'],
            [/[/*]/, 'comment']
          ],

          string: [
            [/[^\\']+/, 'string'],
            [/\\./, 'string.escape.invalid'],
            [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
          ],

          dblstring: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape.invalid'],
            [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
          ]
        }
      })

      // Register completion provider for ClickHouse tables and columns
      monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (_model, _position) => {
          const word = _model.getWordUntilPosition(_position)
          const range = {
            startLineNumber: _position.lineNumber,
            endLineNumber: _position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          }

          const suggestions = [
            // Tables
            {
              label: 'traces',
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: 'traces',
              documentation: 'Main traces table with all telemetry data',
              range
            },
            // Common columns from unified view
            {
              label: 'trace_id',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'trace_id',
              range
            },
            {
              label: 'service_name',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'service_name',
              range
            },
            {
              label: 'operation_name',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'operation_name',
              range
            },
            {
              label: 'duration_ms',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'duration_ms',
              range
            },
            {
              label: 'ingestion_path',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'ingestion_path',
              range
            },
            {
              label: 'schema_version',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'schema_version',
              range
            },
            {
              label: 'is_error',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: 'is_error',
              range
            },
            // Query templates
            {
              label: 'unified-traces-query',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: [
                'SELECT',
                '  trace_id,',
                '  service_name,',
                '  operation_name,',
                '  duration_ms,',
                '  start_time as timestamp,',
                '  status_code',
                'FROM traces',
                'WHERE start_time >= subtractHours(now(), 1)',
                'ORDER BY start_time DESC',
                'LIMIT 100'
              ].join('\n'),
              documentation: 'Template for querying unified traces',
              range
            }
          ]

          return { suggestions }
        }
      })

      // Add keyboard shortcuts
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        onRunQuery?.()
      })

      // Focus editor
      editor.focus()
    },
    [onRunQuery]
  )

  const handleChange = useCallback(
    (value: string | undefined) => {
      onChange(value || '')
    },
    [onChange]
  )

  return (
    <div data-testid="monaco-query-editor">
      <Editor
        height={height}
        language={language}
        theme={darkMode ? 'vs-dark' : 'vs'}
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly: false,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          quickSuggestions: true
        }}
      />
    </div>
  )
}
