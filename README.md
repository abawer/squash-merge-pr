# GitHub Default Squash Merge

Chrome extension that automatically selects **Squash and merge** in GitHub pull request merge boxes whenever it is available.
It supports both GitHub pull request views: the classic view and the newer preview view.

> **Note:** This extension does **not** merge pull requests for you. It only changes the selected merge method to "Squash and merge" when the merge box is available, so your main branch history stays clean and isn't polluted with every individual PR commit message. You still click the merge button yourself.

[![Squash and merge](assets/squash-merge.png)](https://joeblu.com/blog/2022_02_squash_merge/)


## Install from GitHub release

1. Download the latest release ZIP:
   https://github.com/abawer/squash-merge-pr/releases/download/v1.0.0/squash-merge-extension.zip
   (or browse all releases: https://github.com/abawer/squash-merge-pr/releases)
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
