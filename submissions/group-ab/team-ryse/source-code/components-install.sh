#!/bin/bash

rm -rf ./src/components/ui

bun --bun run shadcn add -o -y \
  accordion \
  alert-dialog \
  alert avatar \
  badge \
  breadcrumb \
  button-group \
  button \
  calendar \
  card \
  carousel \
  chart \
  checkbox \
  collapsible \
  combobox \
  command \
  dialog \
  drawer \
  dropdown-menu \
  empty \
  field \
  hover-card \
  input-group \
  input-otp \
  input \
  item \
  kbd \
  label \
  menubar \
  navigation-menu \
  pagination \
  popover \
  progress \
  radio-group \
  scroll-area \
  select \
  separator \
  sheet \
  sidebar \
  skeleton \
  slider \
  sonner \
  spinner \
  switch \
  table \
  tabs \
  textarea \
  toggle-group \
  toggle \
  tooltip

bun add @tanstack/react-table
