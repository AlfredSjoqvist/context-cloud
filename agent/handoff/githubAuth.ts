import { Octokit } from "@octokit/rest";

export interface GithubAuth {
  forRepo(owner: string, repo: string): Promise<Octokit>;
}

export class PatAuth implements GithubAuth {
  constructor(private readonly token: string) {}

  async forRepo(_owner: string, _repo: string): Promise<Octokit> {
    return new Octokit({ auth: this.token });
  }
}
