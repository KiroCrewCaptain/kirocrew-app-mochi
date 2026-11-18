/**
 * The dashboard's select as the watch form's category picker used it
 * (`SimpleSelect`): the host's own themed dropdown (`Select` from
 * `@kirocrew/app-sdk/ui`), or a native `<select>` on a host without one.
 */
import type { ComponentType } from 'react'
import * as ui from '@kirocrew/app-sdk/ui'
import type { SelectProps } from '@kirocrew/app-sdk/ui'
import NativeSelect from './NativeSelect'

const Select: ComponentType<SelectProps> = ('Select' in ui ? ui.Select : undefined) ?? NativeSelect

export default Select
