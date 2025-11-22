import * as React from 'react';
import renderer from 'react-test-renderer';

import { ThemedText } from '../ThemedText';

import { act } from 'react-test-renderer';

it(`renders correctly`, async () => {
  let tree;
  await act(async () => {
    tree = renderer.create(<ThemedText>Snapshot test!</ThemedText>);
  });

  expect(tree.toJSON()).toMatchSnapshot();
});
