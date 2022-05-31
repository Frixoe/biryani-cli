const { Octokit } = require("@octokit/rest");
import helpers from "./utils/helpers";
import githubAuth from "./utils/githubAuth";
import { fs, vol } from "memfs";
var filesys = require("fs");

const makeLibsArray = (libs) => {
  const stats = [];
  const x = Object.keys(libs);
  for (let i = 0; i < x.length; i++) {
    stats.push([x[i], ...libs[x[i]]]);
  }
  return stats;
};

const createBranch = async (token, options, repoUser, user) => {
  // create a branch
  // get the sha of the master branch
  const octokit = new Octokit({
    auth: token,
  });
  const masterRef = await octokit.rest.git.getRef({
    owner: repoUser[0],
    repo: repoUser[1],
    ref: "heads/master",
  });

  const branchRef = masterRef.data.object.sha;
  // create new branch
  const newRef = await octokit.rest.git.createRef({
    owner: repoUser[0],
    repo: repoUser[1],
    ref: `refs/heads/bump-${options.library}`,
    sha: branchRef,
  });
  console.log("New Brach created🎉");

  //   commit change in package.json
  const { libversions, pkg } = await githubAuth.getContents(token, options);
  const stats = makeLibsArray(libversions);

  for (let i = 0; i < stats.length; i++) {
    if (stats[i][3] == "no") {
      const data = pkg[i];
      data.dependencies[options.library.split("@")[0]] = `^${
        options.library.split("@")[1]
      }`;
      const sha = pkg[i].sha;
      //   delete sha
      delete data.sha;
      let objJsonStr = JSON.stringify(data);
      let objJsonB64 = Buffer.from(objJsonStr).toString("base64");

      const update = await octokit.rest.repos.createOrUpdateFileContents({
        owner: repoUser[0],
        repo: repoUser[1],
        path: "package.json",
        message: "bump version",
        branch: `bump-${options.library}`,
        sha: sha,
        committer: {
          name: user.data.login,
          email: "dev.ashar2019@vitstudent.ac.in",
        },
        content: objJsonB64,
      });
      console.log("Changes Created🎉");
    }
  }
};
export default {
  makePR: async (token, options) => {
    const csvContents = await helpers.parseCSV(options);
    const octokit = new Octokit({
      auth: token,
    });
    const user = await octokit.rest.users.getAuthenticated();
    const userName = user.data.login;

    for (let i = 0; i < csvContents.length; i++) {
      if (csvContents[i].name == "") {
        continue;
      }
      const repoUser = csvContents[i].repo
        .replace("https://github.com/", "")
        .split("/");
      try {
        const check_collab = await octokit.rest.repos.checkCollaborator({
          owner: repoUser[0],
          repo: repoUser[1],
          username: userName,
        });
        if (check_collab.status == 204) {
          console.log(
            "You are collaborator of this repository, we will create a branch"
          );

          await createBranch(token, options, repoUser, user);
        }
      } catch (e) {
        if (e.status == 403) {
          console.log(
            "You are not collaborator of this repository, we will fork and make a pr"
          );
          await createFork();
        }
      }
    }
  },
};
