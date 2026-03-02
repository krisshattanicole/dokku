# Repository Management

> [!IMPORTANT]
> New as of 0.6.0

```
repo:gc <app>                            # Runs 'git gc --aggressive' against the application's repo
repo:purge-cache <app>                   # Deletes the contents of the build cache stored in the repository
```

The repository plugin is meant to allow users to perform management commands against a repository.

## Usage

### Git Garbage Collection

This will run a git gc --aggressive against the applications repo. This is performed on the Dokku host, and not within an application container.

```shell
dokku repo:gc node-js-app
```

```
Counting objects: 396, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (365/365), done.
Writing objects: 100% (396/396), done.
Total 396 (delta 79), reused 315 (delta 0)
```

### Clearing Application cache

Building containers with buildpacks currently results in a persistent `cache` directory between deploys. If you need to clear this cache directory for any reason, you may do so by running the following shell command:

```shell
dokku repo:purge-cache node-js-app
```

## Detaching a fork to make a repository private

GitHub requires forks to stay public. To make a forked repository private, first detach it from the upstream:

1. In **Settings → Danger Zone**, use **Leave fork network** (if available) to detach while retaining stars, issues, and pull requests.
2. If the UI option is unavailable, submit the [GitHub fork detach request form](https://support.github.com/request/fork) and wait for the repository to be disconnected.
3. As a last resort, mirror-push the fork to a new repository and delete the original fork—this severs the fork relationship but also drops issues and pull requests.

After detaching, change the repository visibility to **Private** in the repository settings.
