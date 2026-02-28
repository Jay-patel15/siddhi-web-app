# Git Workflow Guide: `main` and `dev` Branches

This document outlines the standard Git commands used to manage code changes safely between the `dev` (development/testing) and `main` (production) branches.

## 🌟 The Basic Concept
- **`main` branch**: This is your stable, live code. It should always be perfectly working.
- **`dev` branch**: This is your "sandbox". You make all new changes, features, and speed optimizations here first to test them without breaking the live app.

---

## 🚀 Scenario 1: Starting New Work
*Goal: You want to add a new feature or fix a bug.*

**Step 1. Ensure you are starting from the stable live code:**
```bash
git checkout main
git pull origin main
```
*(Explanation: `checkout` switches your view to the 'main' code. `pull` downloads any latest changes from GitHub).*

**Step 2. Create and switch to your testing branch:**
```bash
git checkout -b dev
```
*(Explanation: The `-b` flag automatically creates a new branch named 'dev' and switches you to it. If the branch already exists, just use `git checkout dev`).*

---

## 💾 Scenario 2: Saving Your Progress in `dev`
*Goal: You have made changes to the code (like the speed improvements) and want to save them.*

**Step 1. Stage all your changed files:**
```bash
git add .
```
*(Explanation: The `.` means "add everything I just modified to be saved").*

**Step 2. Commit (save) the changes with a descriptive message:**
```bash
git commit -m "Describe what you changed here"
```
*(Explanation: This permanently saves your changes locally. Example: `git commit -m "Stacked action buttons and fixed GPS lag"`).*

**Step 3. Push your saved branch to GitHub:**
```bash
git push origin dev
```
*(Note: If pushing the branch for the very first time, run `git push -u origin dev`).*

---

## 🔄 Scenario 3: Merging Tested Code to Live (`main`)
*Goal: You have tested everything on `dev` and it works perfectly. You are ready to make it live.*

**Step 1. Switch back to your stable live branch:**
```bash
git checkout main
```

**Step 2. Get the latest live code just in case it changed:**
```bash
git pull origin main
```

**Step 3. Merge (combine) your `dev` changes into `main`:**
```bash
git merge dev
```
*(Explanation: This takes all the code from 'dev' and injects it into 'main').*

**Step 4. Push the newly combined live code up to GitHub:**
```bash
git push origin main
```

---

## 🗑️ Scenario 4: Cleaning Up
*Goal: The feature is live! You can delete the `dev` branch if you want to start fresh later.*

**To delete the local `dev` branch:**
```bash
git branch -d dev
```

**To delete the `dev` branch from GitHub:**
```bash
git push origin --delete dev
```
*(Note: You do not HAVE to delete the `dev` branch. You can keep reusing it by just repeating Scenarios 1 & 2).*

---

## ⚡ Scenario 5: Directly updating Live (`main`)
*Goal: It's just a tiny typo or a very urgent hotfix and you want to bypass the `dev` testing branch entirely.*

**Step 1. Ensure you are on the main branch:**
```bash
git checkout main
```

**Step 2. Stage your quick changes:**
```bash
git add .
```

**Step 3. Commit your hotfix:**
```bash
git commit -m "Quick fix for X"
```

**Step 4. Push directly to live:**
```bash
git push origin main
```
*⚠️ Warning: Only use this for minor, foolproof changes. If you break `main`, it breaks for everyone using the app immediately!*
