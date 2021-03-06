# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

"""Test trait types of the widget packages."""
import array

from unittest import TestCase
from traitlets import HasTraits
from traitlets.tests.test_traitlets import TraitTestBase
from ipywidgets import Color
from ipywidgets.widgets.widget import _remove_buffers, _put_buffers


class ColorTrait(HasTraits):
    value = Color("black")


class TestColor(TraitTestBase):
    obj = ColorTrait()

    _good_values = ["blue", "#AA0", "#FFFFFF"]
    _bad_values = ["vanilla", "blues"]


class TestBuffers(TestCase):
    def test_remove_and_put_buffers(self):
        mv1 =  memoryview(b'test1')
        mv2 =  memoryview(b'test2')
        state = {'plain': [0, 'text'], # should not get removed
                 'x': {'ar': mv1}, # should result in an empty dict
                 'y': {'shape': (10, 10), 'data': mv1},
                 'z': (mv1, mv2), # tests tuple assigment
                 'top': mv1, # test a top level removal
                 'deep': {'a': 1, 'b':[0,{'deeper':mv2}]}} # deeply nested
        plain = state['plain']
        x = state['x']
        y = state['y']
        y_shape = y['shape']
        state_before = state
        state, buffer_paths, buffers = _remove_buffers(state)

        # check if buffers are removed
        self.assertIn('plain', state)
        self.assertIn('shape', state['y'])
        self.assertNotIn('ar', state['x'])
        self.assertEqual(state['x'], {})
        self.assertNotIn('data', state['y'])
        self.assertNotIn(mv1, state['z'])
        self.assertNotIn(mv1, state['z'])
        self.assertNotIn('top', state)
        self.assertIn('deep', state)
        self.assertIn('b', state['deep'])
        self.assertNotIn('deeper', state['deep']['b'][1])

        # check that items that didn't need change aren't touched
        self.assertIsNot(state, state_before)
        self.assertIs(state['plain'], plain)
        self.assertIsNot(state['x'], x)
        self.assertIsNot(state['y'], y)
        self.assertIs(state['y']['shape'], y_shape)

        # check that the buffer paths really point to the right buffer
        for path, buffer in [(['x', 'ar'], mv1), (['y', 'data'], mv1), (['z', 0], mv1), (['z', 1], mv2),\
                             (['top'], mv1), (['deep', 'b', 1, 'deeper'], mv2)]:
            self.assertIn(path, buffer_paths, "%r not in path" % path)
            index = buffer_paths.index(path)
            self.assertEqual(buffer, buffers[index])

        # and check that we can put it back together again
        _put_buffers(state, buffer_paths, buffers)
        # we know that tuples get converted to list, so help the comparison by changing the tuple to a list
        state_before['z'] = list(state_before['z'])
        self.assertEqual(state_before, state)
