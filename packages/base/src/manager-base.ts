// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as utils from './utils';
import * as services from '@jupyterlab/services';

import {
    IState, IBuffer, IStateMap
} from './state';

import {
    WidgetModel, WidgetView
} from './widget';

import {
    IClassicComm
} from './services-shim';

import {
    PROTOCOL_VERSION
} from './version';

const PROTOCOL_MAJOR_VERSION = PROTOCOL_VERSION.split('.', 1)[0];

/**
 * The options for a model.
 *
 * #### Notes
 * Either a comm or a model_id must be provided.
 */
export
interface ModelOptions {
    /**
     * Target name of the widget model to create.
     */
    model_name: string;

    /**
     * Module name of the widget model to create.
     */
    model_module: string;

    /**
     * Semver version requirement for the model module.
     */
    model_module_version: string;

    /**
     * Target name of the widget view to create.
     */
    view_name?: string;

    /**
     * Module name of the widget view to create.
     */
    view_module?: string;

    /**
     * Semver version requirement for the view module.
     */
    view_module_version?: string;

    /**
     * Comm object associated with the widget.
     */
    comm?: any;

    /**
     * The model id to use. If not provided, the comm id of the comm is used.
     */
    model_id?: string;
}

/**
 * The options for a connected model.
 *
 * This gives all of the information needed to instantiate a comm to a new
 * widget on the kernel side (so view information is mandatory).
 *
 * #### Notes
 * Either a comm or a model_id must be provided.
 */
export
interface WidgetOptions {
    /**
     * Target name of the widget model to create.
     */
    model_name: string;

    /**
     * Module name of the widget model to create.
     */
    model_module: string;

    /**
     * Semver version requirement for the model module.
     */
    model_module_version: string;

    /**
     * Target name of the widget view to create.
     */
    view_name: string;

    /**
     * Module name of the widget view to create.
     */
    view_module: string;

    /**
     * Semver version requirement for the view module.
     */
    view_module_version: string;

    /**
     * Comm object associated with the widget.
     */
    comm?: IClassicComm;

    /**
     * The model id to use. If not provided, the comm id of the comm is used.
     */
    model_id?: string;
}


export
interface StateOptions {
    /**
     * Drop model attributes that are equal to their default value.
     *
     * @default false
     */
    drop_defaults?: boolean;
}

/**
 * Manager abstract base class
 */
export
abstract class ManagerBase<T> {

    /**
     * Display a view for a particular model.
     */
    display_model(msg: services.KernelMessage.IMessage, model: WidgetModel, options: any = {}): Promise<T> {
        return this.create_view(model, options).then(
            view => this.display_view(msg, view, options)).catch(utils.reject('Could not create view', true));
    }

    /**
     * Display a view.
     *
     * #### Notes
     * This must be implemented by a subclass. The implementation must trigger the view's displayed
     * event after the view is on the page: `view.trigger('displayed')`
     */
    abstract display_view(msg: services.KernelMessage.IMessage, view: WidgetView, options: any): Promise<T>;

    /**
     * Modifies view options. Generally overloaded in custom widget manager
     * implementations.
     */
    setViewOptions(options: any = {}): any {
        return options;
    }

    /**
     * Creates a promise for a view of a given model
     *
     * Make sure the view creation is not out of order with
     * any state updates.
     */
    create_view(model: WidgetModel, options = {}): Promise<WidgetView> {
        let viewPromise = model.state_change = model.state_change.then(() => {
            return this.loadClass(model.get('_view_name'),
                model.get('_view_module'),
                model.get('_view_module_version')
            ).then((ViewType: typeof WidgetView) => {
                let view: WidgetView = new ViewType({
                    model: model,
                    options: this.setViewOptions(options)
                });
                view.listenTo(model, 'destroy', view.remove);
                return Promise.resolve(view.render()).then(() => { return view; });
            }).catch(utils.reject('Could not create a view for model id ' + model.model_id, true));
        });
        let id = utils.uuid();
        model.views[id] = viewPromise;
        viewPromise.then((view) => {
            view.once('remove', () => { delete view.model.views[id]; }, this);
        });
        return model.state_change;
    }

    /**
     * callback handlers specific to a view
     */
    callbacks (view?: WidgetView) {
        return {};
    }

    /**
     * Get a promise for a model by model id.
     */
    get_model(model_id: string): Promise<WidgetModel> {
        // TODO: Perhaps we should return a Promise.reject if the model is not
        // found. Right now this isn't a true async function because it doesn't
        // always return a promise.
        return this._models[model_id];
    }

    /**
     * Handle when a comm is opened.
     */
    handle_comm_open(comm: IClassicComm, msg: services.KernelMessage.ICommOpenMsg): Promise<WidgetModel> {
        let protocolVersion = ((msg.metadata || {})['version'] as string) || '';
        if (protocolVersion.split('.', 1)[0] !== PROTOCOL_MAJOR_VERSION) {
            let error = `Wrong widget protocol version: received protocol version '${protocolVersion}', but was expecting major version '${PROTOCOL_MAJOR_VERSION}'`;
            console.error(error);
            return Promise.reject(error);
        }
        let data = (msg.content.data as any);
        let buffer_paths = data.buffer_paths || [];
        // Make sure the buffers are DataViews
        let buffers = (msg.buffers || []).map(b => {
            if (b instanceof DataView) {
                return b;
            } else {
                return new DataView(b instanceof ArrayBuffer ? b : b.buffer);
            }
        });
        utils.put_buffers(data.state, buffer_paths, buffers);
        return this.new_model({
            model_name: data.state['_model_name'],
            model_module: data.state['_model_module'],
            model_module_version: data.state['_model_module_version'],
            comm: comm
        }, data.state).catch(utils.reject('Could not create a model.', true));
    }

    /**
     * Create a comm and new widget model.
     * @param  options - same options as new_model but comm is not
     *                          required and additional options are available.
     * @param  serialized_state - serialized model attributes.
     */
    new_widget(options: WidgetOptions, serialized_state: any = {}): Promise<WidgetModel> {
        let commPromise;
        // we check to make sure the view information is provided, to help catch
        // backwards incompatibility errors.
        if (options.view_name === undefined
            || options.view_module === undefined
            || options.view_module_version === undefined) {
            return Promise.reject('new_widget(...) must be given view information in the options.');
        }
        // If no comm is provided, a new comm is opened for the jupyter.widget
        // target.
        if (options.comm) {
            commPromise = Promise.resolve(options.comm);
        } else {
            commPromise = this._create_comm(
                this.comm_target_name,
                options.model_id,
                {
                    state: {
                            _model_module: options.model_module,
                            _model_module_version: options.model_module_version,
                            _model_name: options.model_name,
                            _view_module: options.view_module,
                            _view_module_version: options.view_module_version,
                            _view_name: options.view_name
                        },
                },
                {version: PROTOCOL_VERSION}
            );
        }
        // The options dictionary is copied since data will be added to it.
        let options_clone = {...options};
        // Create the model. In the case where the comm promise is rejected a
        // comm-less model is still created with the required model id.
        return commPromise.then((comm) => {
            // Comm Promise Resolved.
            options_clone.comm = comm;
            let widget_model = this.new_model(options_clone, serialized_state);
            return widget_model.then(model => {
                model.sync('create', model);
                return model;
            });
        }, () => {
            // Comm Promise Rejected.
            if (!options_clone.model_id) {
                options_clone.model_id = utils.uuid();
            }
            return this.new_model(options_clone, serialized_state);
        });
    }

    register_model(model_id: string, modelPromise: Promise<WidgetModel>): void {
        this._models[model_id] = modelPromise;
        modelPromise.then(model => {
            model.once('comm:close', () => {
                delete this._models[model_id];
            });
        });
    }

    /**
     * Create and return a promise for a new widget model
     *
     * @param options - the options for creating the model.
     * @param serialized_state - attribute values for the model.
     *
     * @example
     * widget_manager.new_model({
     *      model_name: 'IntSlider',
     *      model_module: '@jupyter-widgets/controls',
     *      model_module_version: '1.0.0',
     *      model_id: 'u-u-i-d'
     * }).then((model) => { console.log('Create success!', model); },
     *  (err) => {console.error(err)});
     *
     */
    async new_model(options: ModelOptions, serialized_state: any = {}): Promise<WidgetModel> {
        let model_id;
        if (options.model_id) {
            model_id = options.model_id;
        } else if (options.comm) {
            model_id = options.model_id = options.comm.comm_id;
        } else {
            throw new Error('Neither comm nor model_id provided in options object. At least one must exist.');
        }

        let modelPromise = this._make_model(options, serialized_state);
        // this call needs to happen before the first `await`, see note in `set_state`:
        this.register_model(model_id, modelPromise);
        return await modelPromise;
    }

    async _make_model(options: ModelOptions, serialized_state: any = {}): Promise<WidgetModel> {
        let model_id = options.model_id;
        let model_promise = this.loadClass(
            options.model_name,
            options.model_module,
            options.model_module_version
        ) as Promise<typeof WidgetModel>;
        let ModelType: typeof WidgetModel;
        try {
            ModelType = await model_promise;
        } catch (error) {
            console.error('Could not instantiate widget');
            throw error;
        }

        if (!ModelType) {
            throw new Error(`Cannot find model module ${options.model_module}@${options.model_module_version}, ${options.model_name}`);
        }

        let attributes = await ModelType._deserialize_state(serialized_state, this);
        let modelOptions = {
            widget_manager: this,
            model_id: model_id,
            comm: options.comm,
        };
        let widget_model = new ModelType(attributes, modelOptions);
        widget_model.name = options.model_name;
        widget_model.module = options.model_module;
        return widget_model;

    }

    /**
     * Close all widgets and empty the widget state.
     * @return Promise that resolves when the widget state is cleared.
     */
    clear_state(): Promise<void> {
        return utils.resolvePromisesDict(this._models).then((models) => {
            Object.keys(models).forEach(id => models[id].close());
            this._models = {};
        });
    }

    /**
     * Asynchronously get the state of the widget manager.
     *
     * This includes all of the widget models, and follows the format given in
     * the @jupyter-widgets/schema package.
     *
     * @param options - The options for what state to return.
     * @returns Promise for a state dictionary
     */
    get_state(options: StateOptions = {}): Promise<IState> {
        return utils.resolvePromisesDict(this._models).then((models) => {
            let state: IStateMap = {};
            Object.keys(models).forEach(model_id => {
                let model = models[model_id];
                let split = utils.remove_buffers(model.serialize(model.get_state(options.drop_defaults)));
                let buffers = split.buffers.map((buffer, index): IBuffer => {
                    return {
                        data: utils.bufferToBase64(buffer),
                        path: split.buffer_paths[index],
                        encoding: 'base64'
                    };
                });
                state[model_id] = {
                    model_name: model.name,
                    model_module: model.module,
                    model_module_version: model.get('_model_module_version'),
                    state: split.state
                };
                // To save space, only include the buffer key if we have buffers
                if (buffers.length > 0) {
                    state[model_id].buffers = buffers;
                }
            });
            return {version_major: 2, version_minor: 0, state: state};
        });
    }

    /**
     * Set the widget manager state.
     *
     * @param state - a Javascript object conforming to the application/vnd.jupyter.widget-state+json spec.
     *
     * Reconstructs all of the widget models in the state, merges that with the
     * current manager state, and then attempts to redisplay the widgets in the
     * state.
     */
    set_state(state): Promise<WidgetModel[]> {
        // Check to make sure that it's the same version we are parsing.
        if (!(state.version_major && state.version_major <= 2)) {
            throw 'Unsupported widget state format';
        }
        let models = state.state;
        // Recreate all the widget models for the given widget manager state.
        let all_models = this._get_comm_info().then(live_comms => {
            /* Note: It is currently safe to just loop over the models in any order,
               given that the following holds (does at the time of writing):
               1: any call to `new_model` with state registers the model promise (e.g. with `register_model`)
                  synchronously (before it's first `await` statement).
               2: any calls to a model constructor or the `set_state` method on a model,
                  happens asynchronously (in a `then` clause, or after an `await` statement).

              Without these assumptions, one risks trying to set model state with a reference
              to another model that doesn't exist yet!
            */
            return Promise.all(Object.keys(models).map(model_id => {

                // First put back the binary buffers
                let decode: { [s: string]: (s: string) => ArrayBuffer; } = {'base64': utils.base64ToBuffer, 'hex': utils.hexToBuffer};
                let model = models[model_id];
                let modelState = model.state;
                if (model.buffers) {
                    let bufferPaths = model.buffers.map(b => b.path);
                    // put_buffers expects buffers to be DataViews
                    let buffers = model.buffers.map(b => new DataView(decode[b.encoding](b.data)));
                    utils.put_buffers(model.state, bufferPaths, buffers);
                }

                // If the model has already been created, set its state and then
                // return it.
                if (this._models[model_id]) {
                    return this._models[model_id].then(model => {
                        // deserialize state
                        return (model.constructor as typeof WidgetModel)._deserialize_state(modelState || {}, this).then(attributes => {
                            model.set_state(attributes);  // case 2
                            return model;
                        });
                    });
                }

                let modelCreate: ModelOptions = {
                    model_id: model_id,
                    model_name: model.model_name,
                    model_module: model.model_module,
                    model_module_version: model.model_module_version
                };
                if (live_comms.hasOwnProperty(model_id)) {  // live comm
                    // This connects to an existing comm if it exists, and
                    // should *not* send a comm open message.
                    return this._create_comm(this.comm_target_name, model_id).then(comm => {
                        modelCreate.comm = comm;
                        return this.new_model(modelCreate);  // No state, so safe wrt. case 1
                    });
                } else {
                    return this.new_model(modelCreate, modelState);  // case 1
                }
            }));
        });

        return all_models;
    }

    /**
     * Disconnect the widget manager from the kernel, setting each model's comm
     * as dead.
     */
    disconnect() {
        Object.keys(this._models).forEach((i) => {
            this._models[i].then(model => { model.comm_live = false; });
        });
    }

    /**
     * Resolve a URL relative to the current notebook location.
     *
     * The default implementation just returns the original url.
     */
    resolveUrl(url: string): Promise<string> {
        return Promise.resolve(url);
    }

    /**
     * The comm target name to register
     */
    readonly comm_target_name = 'jupyter.widget';

    /**
     * Load a class and return a promise to the loaded object.
     */
    protected abstract loadClass(className: string, moduleName: string, moduleVersion: string): Promise<typeof WidgetModel | typeof WidgetView>;

    /**
     * Create a comm which can be used for communication for a widget.
     *
     * If the data/metadata is passed in, open the comm before returning (i.e.,
     * send the comm_open message). If the data and metadata is undefined, we
     * want to reconstruct a comm that already exists in the kernel, so do not
     * open the comm by sending the comm_open message.
     *
     * @param comm_target_name Comm target name
     * @param model_id The comm id
     * @param data The initial data for the comm
     * @param metadata The metadata in the open message
     */
    protected abstract _create_comm(
        comm_target_name: string,
        model_id?: string,
        data?: any,
        metadata?: any,
        buffers?: ArrayBuffer[] | ArrayBufferView[]):
        Promise<IClassicComm>;
    protected abstract _get_comm_info(): any;

    /**
     * Dictionary of model ids and model instance promises
     */
    private _models: {[key: string]: Promise<WidgetModel>} = Object.create(null);
}
