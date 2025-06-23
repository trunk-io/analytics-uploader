// package: trunk.analytics_uploader.telemetry.v1
// file: telemetry.proto

import * as jspb from "google-protobuf";

export class Semver extends jspb.Message {
  getMajor(): number;
  setMajor(value: number): void;

  getMinor(): number;
  setMinor(value: number): void;

  getPatch(): number;
  setPatch(value: number): void;

  getSuffix(): string;
  setSuffix(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Semver.AsObject;
  static toObject(includeInstance: boolean, msg: Semver): Semver.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: Semver,
    writer: jspb.BinaryWriter,
  ): void;
  static deserializeBinary(bytes: Uint8Array): Semver;
  static deserializeBinaryFromReader(
    message: Semver,
    reader: jspb.BinaryReader,
  ): Semver;
}

export namespace Semver {
  export type AsObject = {
    major: number;
    minor: number;
    patch: number;
    suffix: string;
  };
}

export class Repo extends jspb.Message {
  getHost(): string;
  setHost(value: string): void;

  getOwner(): string;
  setOwner(value: string): void;

  getName(): string;
  setName(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Repo.AsObject;
  static toObject(includeInstance: boolean, msg: Repo): Repo.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: Repo,
    writer: jspb.BinaryWriter,
  ): void;
  static deserializeBinary(bytes: Uint8Array): Repo;
  static deserializeBinaryFromReader(
    message: Repo,
    reader: jspb.BinaryReader,
  ): Repo;
}

export namespace Repo {
  export type AsObject = {
    host: string;
    owner: string;
    name: string;
  };
}

export class UploaderUploadMetrics extends jspb.Message {
  hasUploaderVersion(): boolean;
  clearUploaderVersion(): void;
  getUploaderVersion(): Semver | undefined;
  setUploaderVersion(value?: Semver): void;

  hasRepo(): boolean;
  clearRepo(): void;
  getRepo(): Repo | undefined;
  setRepo(value?: Repo): void;

  getFailed(): boolean;
  setFailed(value: boolean): void;

  getFailureReason(): string;
  setFailureReason(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UploaderUploadMetrics.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: UploaderUploadMetrics,
  ): UploaderUploadMetrics.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: UploaderUploadMetrics,
    writer: jspb.BinaryWriter,
  ): void;
  static deserializeBinary(bytes: Uint8Array): UploaderUploadMetrics;
  static deserializeBinaryFromReader(
    message: UploaderUploadMetrics,
    reader: jspb.BinaryReader,
  ): UploaderUploadMetrics;
}

export namespace UploaderUploadMetrics {
  export type AsObject = {
    uploaderVersion?: Semver.AsObject;
    repo?: Repo.AsObject;
    failed: boolean;
    failureReason: string;
  };
}
