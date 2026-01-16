import protobuf from "protobufjs";

// This uses protobufjs's reflection library to define the protobuf in-code.
// We do this as the easiest of the following:
// - standard protoc builds from a proto file require a number of regex substitutions
//   in order to port protoc's generated code to esm modules, which requires adding a
//   bunch of extra build complexity for what should ultimately be a simple package
// - using protobufjs's load function to load a proto file uses XMLHttpRequest to load
//   files, which is not available in the environment Github Actions run in
// - this, which is a bit unique, but is directly usable.
export const Semver = new protobuf.Type("Semver")
  .add(new protobuf.Field("major", 1, "uint32"))
  .add(new protobuf.Field("minor", 2, "uint32"))
  .add(new protobuf.Field("patch", 3, "uint32"))
  .add(new protobuf.Field("suffix", 4, "string"));

export const Repo = new protobuf.Type("Repo")
  .add(new protobuf.Field("host", 1, "string"))
  .add(new protobuf.Field("owner", 2, "string"))
  .add(new protobuf.Field("name", 3, "string"));

export const UploaderUploadMetrics = new protobuf.Type("UploaderUploadMetrics")
  .add(new protobuf.Field("uploader_version", 1, "Semver"))
  .add(new protobuf.Field("repo", 2, "Repo"))
  .add(new protobuf.Field("failed", 3, "bool"))
  .add(new protobuf.Field("failure_reason", 4, "string"))
  .add(Semver)
  .add(Repo);
