// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

declare var __webpack_public_path__: string;
__webpack_public_path__ = (window as any).__jupyter_widgets_assets_path__ || __webpack_public_path__;

import 'font-awesome/css/font-awesome.css';
import '@phosphor/widgets/style/index.css';
import '@jupyter-widgets/controls/css/widgets.built.css';

// Used just for the typing. We must not import the javascript because we don't
// want to include it in the require embedding.
import {
    HTMLManager
} from './index';

// Load json schema validator
const Ajv = require('ajv');
const widget_state_schema = require('@jupyter-widgets/schema').v2.state;
const widget_view_schema = require('@jupyter-widgets/schema').v2.view;

let ajv = new Ajv();
let model_validate = ajv.compile(widget_state_schema);
let view_validate = ajv.compile(widget_view_schema);

/**
 * Render the inline widgets inside a DOM element.
 *
 * @param managerFactory A function that returns a new HTMLManager
 * @param element (default document.documentElement) The document element in which to process for widget state.
 */
export
function renderWidgets(managerFactory: () => HTMLManager, element: HTMLElement = document.documentElement) {
    let tags = element.querySelectorAll('script[type="application/vnd.jupyter.widget-state+json"]');
    for (let i=0; i !== tags.length; ++i) {
        renderManager(element, JSON.parse(tags[i].innerHTML), managerFactory);
    }
}

/**
 * Create a widget manager for a given widget state.
 *
 * @param element The DOM element to search for widget view state script tags
 * @param widgetState The widget manager state
 *
 * #### Notes
 *
 * Widget view state should be in script tags with type
 * "application/vnd.jupyter.widget-view+json". Any such script tag containing a
 * model id the manager knows about is replaced with a rendered view.
 * Additionally, if the script tag has a prior img sibling with class
 * 'jupyter-widget', then that img tag is deleted.
 */
function renderManager(element: HTMLElement, widgetState: any, managerFactory: () => HTMLManager) {
    let valid = model_validate(widgetState);
    if (!valid) {
        console.error('Model state has errors.', model_validate.errors);
    }
    let manager = managerFactory();
    manager.set_state(widgetState).then(function(models) {
        let tags = element.querySelectorAll('script[type="application/vnd.jupyter.widget-view+json"]');
        for (let i=0; i !== tags.length; ++i) {
            let viewtag = tags[i];
            let widgetViewObject = JSON.parse(viewtag.innerHTML);
            let valid = view_validate(widgetViewObject);
            if (!valid) {
                console.error('View state has errors.', view_validate.errors);
            }
            let model_id: string = widgetViewObject.model_id;
            // Find the model id in the models. We should use .find, but IE
            // doesn't support .find
            let model = models.filter( (item) => {
                return item.model_id === model_id;
            })[0];
            if (model !== undefined) {
                let prev = viewtag.previousElementSibling;
                if (prev && prev.tagName === 'img' && prev.classList.contains('jupyter-widget')) {
                    viewtag.parentElement.removeChild(prev);
                }
                let widgetTag = document.createElement('div');
                widgetTag.className = 'widget-subarea';
                viewtag.parentElement.insertBefore(widgetTag, viewtag);
                manager.display_model(undefined, model, { el : widgetTag });
            }
        }
    });
}
