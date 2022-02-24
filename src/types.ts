import { Octokit } from "@octokit/core"

import type { wasOctokitExtendedByApplication } from "src/github"

export type Issue = {
  nodeId: string
}

export type ExtendedOctokit = Octokit & {
  [wasOctokitExtendedByApplication]: true
}

type KeysOfType<T, U> = { [K in keyof T]: T[K] extends U ? K : never }[keyof T]
type RequiredKeys<T> = Exclude<
  KeysOfType<T, Exclude<T[keyof T], undefined>>,
  undefined
>
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>
export type ToRequired<T> = {
  [K in OptionalKeys<T>]: T[K] extends undefined | infer U ? U : T[K]
}

export type ToOptional<T> = { [K in keyof T]?: T[K] }
