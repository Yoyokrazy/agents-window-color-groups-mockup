/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Build-time stand-in for the `source-map-support` package.
//
// vscode's fixtureUtils.ts installs it so fixture stack traces point at sources; it
// then fetches `<script>.map` synchronously whenever a stack is formatted. The demo
// ships without source maps, so those requests would only 404.

export function install() { }

export default { install };
