/**
* This file was automatically generated by json-schema-to-typescript.
* DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
* and run json-schema-to-typescript to regenerate this file.
*/

export interface IBuffer {

  /**
   * A path for a binary buffer value.
   */
  path: (string | number)[];

  /**
   * A binary buffer encoded as specified in the 'encoding' property
   */
  data: string;

  /**
   * The encoding of the buffer data
   */
  encoding: ("hex" | "base64");

  [k: string]: any;

}

export interface IStateEntry {
  /**
   * Name of the JavaScript class holding the model implementation
   */
  model_name: string;

  /**
   * Name of the JavaScript module holding the model implementation
   */
  model_module: string;

  /**
   * Semver range for the JavaScript module holding the model implementation
   */
  model_module_version?: string;

  /**
   * Serialized state of the model
   */
  state: {
    [k: string]: any;
  };

  /**
   * Binary buffers in the state
   */
  buffers?: IBuffer[];

  [k: string]: any;
}

export interface IStateMap {
  [k: string]: IStateEntry
}

/**
 * Jupyter Interactive Widget State JSON schema.
 */
export interface IState {
  /**
   * Format version (major)
   */
  version_major: number;
  /**
   * Format version (minor)
   */
  version_minor: number;
  /**
   * Model State for All Widget Models - keys are model ids, values are model state
   */
  state: IStateMap;
  [k: string]: any;
}
