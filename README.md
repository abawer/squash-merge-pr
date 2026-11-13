# GitHub Default Squash Merge

Chrome extension that automatically selects **Squash and merge** in GitHub pull request merge boxes whenever it is available.

## Install from GitHub release

1. Download the latest `squash-merge-extension.zip` from the GitHub Releases page.
2. Extract the ZIP to a folder on your computer.
3. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder.
6. Open any GitHub pull request where you can merge; the merge button defaults to "Squash and merge".

## Install from source

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Open any GitHub pull request where you can merge; the merge button defaults to "Squash and merge".

## How it works

A content script runs on `github.com/*/pull/*` pages. It waits for GitHub's merge box, opens the "Select merge method" menu when needed, and clicks "Squash and merge". It retries briefly for late-loading merge boxes and resets on GitHub's in-app navigation.