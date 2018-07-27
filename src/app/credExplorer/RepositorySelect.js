// @flow

import React, {type Node} from "react";
import sortBy from "lodash.sortby";
import deepEqual from "lodash.isequal";

import * as NullUtil from "../../util/null";
import type {LocalStore} from "../localStore";

import {type Repo, fromJSON, REPO_REGISTRY_API} from "./repoRegistry";
export const REPO_KEY = "selectedRepository";

export type Status =
  | {|+type: "LOADING"|}
  | {|
      +type: "VALID",
      +availableRepos: $ReadOnlyArray<Repo>,
      +selectedRepo: Repo,
    |}
  | {|+type: "NO_REPOS"|}
  | {|+type: "FAILURE"|};

type Props = {|
  +onChange: (x: Repo) => void,
  +localStore: LocalStore,
|};
type State = {|status: Status|};
export default class RepositorySelect extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      status: {type: "LOADING"},
    };
  }

  componentDidMount() {
    loadStatus(this.props.localStore).then((status) => {
      this.setState({status});
      if (status.type === "VALID") {
        this.props.onChange(status.selectedRepo);
      }
    });
  }

  onChange(selectedRepo: Repo) {
    const status = this.state.status;
    if (status.type === "VALID") {
      const newStatus = {...status, selectedRepo};
      this.setState({status: newStatus});
    }
    this.props.onChange(selectedRepo);
  }

  render() {
    return (
      <LocalStoreRepositorySelect
        onChange={(selectedRepo) => this.onChange(selectedRepo)}
        status={this.state.status}
        localStore={this.props.localStore}
      >
        {({status, onChange}) => (
          <PureRepositorySelect onChange={onChange} status={status} />
        )}
      </LocalStoreRepositorySelect>
    );
  }
}

function validateRepo(repo: Repo) {
  const validRe = /^[A-Za-z0-9_-]+$/;
  if (!repo.owner.match(validRe)) {
    throw new Error(`Invalid repository owner: ${JSON.stringify(repo.owner)}`);
  }
  if (!repo.name.match(validRe)) {
    throw new Error(`Invalid repository name: ${JSON.stringify(repo.name)}`);
  }
}

function repoStringToRepo(x: string): Repo {
  const pieces = x.split("/");
  if (pieces.length !== 2) {
    throw new Error(`Invalid repo string: ${x}`);
  }
  const repo = {owner: pieces[0], name: pieces[1]};
  validateRepo(repo);
  return repo;
}

export async function loadStatus(localStore: LocalStore): Promise<Status> {
  try {
    const response = await fetch(REPO_REGISTRY_API);
    if (!response.ok) {
      console.error(response);
      return {type: "FAILURE"};
    }
    const json = await response.json();
    const availableRepos = fromJSON(json);
    if (availableRepos.length === 0) {
      return {type: "NO_REPOS"};
    }
    const localStoreRepo = localStore.get(REPO_KEY, null);
    const selectedRepo = NullUtil.orElse(
      availableRepos.find((x) => deepEqual(x, localStoreRepo)),
      availableRepos[availableRepos.length - 1]
    );
    const sortedRepos = sortBy(availableRepos, (r) => r.owner, (r) => r.name);
    return {type: "VALID", availableRepos: sortedRepos, selectedRepo};
  } catch (e) {
    console.error(e);
    return {type: "FAILURE"};
  }
}

export class LocalStoreRepositorySelect extends React.Component<{|
  +status: Status,
  +onChange: (repo: Repo) => void,
  +localStore: LocalStore,
  +children: ({
    status: Status,
    onChange: (selectedRepo: Repo) => void,
  }) => Node,
|}> {
  render() {
    return this.props.children({
      status: this.props.status,
      onChange: (repo) => {
        this.props.onChange(repo);
        this.props.localStore.set(REPO_KEY, repo);
      },
    });
  }
}

type PureRepositorySelectProps = {|
  +onChange: (x: Repo) => void,
  +status: Status,
|};
export class PureRepositorySelect extends React.PureComponent<
  PureRepositorySelectProps
> {
  renderSelect(availableRepos: $ReadOnlyArray<Repo>, selectedRepo: ?Repo) {
    return (
      <label>
        <span>Please choose a repository to inspect:</span>{" "}
        {selectedRepo != null && (
          <select
            value={`${selectedRepo.owner}/${selectedRepo.name}`}
            onChange={(e) => {
              const repoString = e.target.value;
              const repo = repoStringToRepo(repoString);
              this.props.onChange(repo);
            }}
          >
            {availableRepos.map(({owner, name}) => {
              const repoString = `${owner}/${name}`;
              return (
                <option value={repoString} key={repoString}>
                  {repoString}
                </option>
              );
            })}
          </select>
        )}
      </label>
    );
  }

  renderError(text: string) {
    return <span style={{fontWeight: "bold", color: "red"}}>{text}</span>;
  }

  render() {
    const {status} = this.props;
    switch (status.type) {
      case "LOADING":
        // Just show an empty select while we wait.
        return this.renderSelect([], null);
      case "VALID":
        return this.renderSelect(status.availableRepos, status.selectedRepo);
      case "NO_REPOS":
        return this.renderError("Error: No repositories found.");
      case "FAILURE":
        return this.renderError(
          "Error: Unable to load repository registry. " +
            "See console for details."
        );
      default:
        throw new Error((status.type: empty));
    }
  }
}