# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

This documentation is available as Markdown for AI agents and LLMs. See the [full Markdown index](/llms.txt) or append .md to any documentation URL.

优先使用 `Expo UI`,如果非要使用 RN 的 UI 框架，在 Expo UI 中需要嵌套 `RNHostView` 来使用 RN View。对于从 RN 导入的 UI 请使用 RN前缀，例如 Text 为 RNText， Button为 RNButton，用来和 Expo UI 区分


# Expo UI

A set of components that allow you to build UIs directly with Jetpack Compose and SwiftUI from React.

<AgentInstructions>

## Submitting Feedback

If you encounter errors, misleading or outdated information, report it so Expo can be improved:

Preferred command:
npx --yes submit-expo-feedback@latest --category docs --subject "/versions/v58.0.0/sdk/ui/" "<actionable feedback>"

Direct HTTP fallback:
curl -X POST https://api.expo.dev/v2/feedback/docs-send -H 'Content-Type: application/json' -d '{"url":"/versions/v58.0.0/sdk/ui/","feedback":"🤖 Agent feedback for docs: <specific, actionable description> (<model>, <harness>)"}'

Only submit when you have something specific and actionable to report. Try to give the most context.

## Navigation

When answering a related or follow-up question, fetch the relevant page below as Markdown (.md) instead of guessing; use llms.txt for the full map.

You are here: Reference (v58.0.0) > Expo UI
Pages in this section:

- [Overview](https://docs.expo.dev/versions/v58.0.0/sdk/ui.md) (this page)
  Full documentation tree: [llms.txt](https://docs.expo.dev/llms.txt)

</AgentInstructions>
Android, iOS, tvOS, Included in Expo Go

`@expo/ui` is a set of native input components that allows you to build fully native interfaces with Jetpack Compose and SwiftUI. It aims to provide the commonly used features and components that a typical app will need.

## Available platforms

Components are available for the following platforms:

- **[Jetpack Compose](/versions/v58.0.0/sdk/ui/jetpack-compose.md)**: Build native Android interfaces with Jetpack Compose components
- **[SwiftUI](/versions/v58.0.0/sdk/ui/swift-ui.md)**: Build native iOS interfaces with SwiftUI components
- **[Universal](/versions/v58.0.0/sdk/ui/universal.md)**: Cross-platform components that run on Android, iOS, and web from a single source

## Drop-in replacements

See **[Drop-in replacements](/versions/v58.0.0/sdk/ui/drop-in-replacements.md)** for API-compatible replacements for popular React Native community libraries.

## Available components

### Jetpack Compose

| Component                                                                                            | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`AlertDialog`](/versions/v58.0.0/sdk/ui/jetpack-compose/alertdialog.md)                             | AlertDialog component for displaying native alert dialogs.                                                       |
| [`Badge`](/versions/v58.0.0/sdk/ui/jetpack-compose/badge.md)                                         | Badge component for displaying status indicators and counts.                                                     |
| [`BadgedBox`](/versions/v58.0.0/sdk/ui/jetpack-compose/badgedbox.md)                                 | BadgedBox component for overlaying badges on content.                                                            |
| [`BasicAlertDialog`](/versions/v58.0.0/sdk/ui/jetpack-compose/basicalertdialog.md)                   | BasicAlertDialog component for displaying dialogs with custom content.                                           |
| [`Box`](/versions/v58.0.0/sdk/ui/jetpack-compose/box.md)                                             | Box component for stacking child elements.                                                                       |
| [`Button`](/versions/v58.0.0/sdk/ui/jetpack-compose/button.md)                                       | Button components for displaying native Material3 buttons.                                                       |
| [`Card`](/versions/v58.0.0/sdk/ui/jetpack-compose/card.md)                                           | Card component for displaying content in a styled container.                                                     |
| [`Carousel`](/versions/v58.0.0/sdk/ui/jetpack-compose/carousel.md)                                   | Carousel components for displaying scrollable collections of items.                                              |
| [`Checkbox`](/versions/v58.0.0/sdk/ui/jetpack-compose/checkbox.md)                                   | Checkbox component for selection controls.                                                                       |
| [`Chip`](/versions/v58.0.0/sdk/ui/jetpack-compose/chip.md)                                           | Chip components for displaying compact elements.                                                                 |
| [`Column`](/versions/v58.0.0/sdk/ui/jetpack-compose/column.md)                                       | Column component for placing children vertically.                                                                |
| [`DateTimePicker`](/versions/v58.0.0/sdk/ui/jetpack-compose/datetimepicker.md)                       | DateTimePicker component for selecting dates and times.                                                          |
| [`Divider`](/versions/v58.0.0/sdk/ui/jetpack-compose/divider.md)                                     | Divider components for creating visual separators.                                                               |
| [`DockedSearchBar`](/versions/v58.0.0/sdk/ui/jetpack-compose/dockedsearchbar.md)                     | DockedSearchBar component for displaying an inline search input.                                                 |
| [`DropdownMenu`](/versions/v58.0.0/sdk/ui/jetpack-compose/dropdownmenu.md)                           | DropdownMenu component for displaying dropdown menus.                                                            |
| [`ExposedDropdownMenuBox`](/versions/v58.0.0/sdk/ui/jetpack-compose/exposeddropdownmenubox.md)       | ExposedDropdownMenuBox component for displaying a dropdown menu with a customizable anchor.                      |
| [`FloatingActionButton`](/versions/v58.0.0/sdk/ui/jetpack-compose/floatingactionbutton.md)           | FloatingActionButton components following Material Design 3.                                                     |
| [`FlowRow`](/versions/v58.0.0/sdk/ui/jetpack-compose/flowrow.md)                                     | FlowRow component for wrapping children horizontally.                                                            |
| [`HorizontalFloatingToolbar`](/versions/v58.0.0/sdk/ui/jetpack-compose/horizontalfloatingtoolbar.md) | HorizontalFloatingToolbar component for displaying a floating action bar.                                        |
| [`HorizontalPager`](/versions/v58.0.0/sdk/ui/jetpack-compose/horizontalpager.md)                     | HorizontalPager component for swipeable pages.                                                                   |
| [`Host`](/versions/v58.0.0/sdk/ui/jetpack-compose/host.md)                                           | Host component for bridging React Native and Jetpack Compose.                                                    |
| [`Icon`](/versions/v58.0.0/sdk/ui/jetpack-compose/icon.md)                                           | Icon component for displaying icons.                                                                             |
| [`IconButton`](/versions/v58.0.0/sdk/ui/jetpack-compose/iconbutton.md)                               | IconButton components for displaying native Material3 icon buttons.                                              |
| [`Image`](/versions/v58.0.0/sdk/ui/jetpack-compose/image.md)                                         | Image component for displaying images.                                                                           |
| [`LazyColumn`](/versions/v58.0.0/sdk/ui/jetpack-compose/lazycolumn.md)                               | LazyColumn component for displaying scrollable lists.                                                            |
| [`LazyRow`](/versions/v58.0.0/sdk/ui/jetpack-compose/lazyrow.md)                                     | LazyRow component for displaying horizontally scrolling lists.                                                   |
| [`ListItem`](/versions/v58.0.0/sdk/ui/jetpack-compose/listitem.md)                                   | ListItem component for displaying structured list entries.                                                       |
| [`LoadingIndicator`](/versions/v58.0.0/sdk/ui/jetpack-compose/loadingindicator.md)                   | Loading indicator components for displaying loading state.                                                       |
| [`Material Colors`](/versions/v58.0.0/sdk/ui/jetpack-compose/colors.md)                              | Read the Material 3 color palette (including Material 3 Dynamic Colors) from JavaScript.                         |
| [`ModalBottomSheet`](/versions/v58.0.0/sdk/ui/jetpack-compose/bottomsheet.md)                        | ModalBottomSheet component that presents content from the bottom of the screen.                                  |
| [`Modifiers`](/versions/v58.0.0/sdk/ui/jetpack-compose/modifiers.md)                                 | Layout modifiers for @expo/ui components.                                                                        |
| [`NavigationBar`](/versions/v58.0.0/sdk/ui/jetpack-compose/navigationbar.md)                         | NavigationBar component for Material 3 bottom navigation.                                                        |
| [`Progress indicators`](/versions/v58.0.0/sdk/ui/jetpack-compose/progress.md)                        | Progress indicator components for displaying operation status.                                                   |
| [`PullToRefreshBox`](/versions/v58.0.0/sdk/ui/jetpack-compose/pulltorefreshbox.md)                   | PullToRefreshBox component for pull-to-refresh interactions.                                                     |
| [`RadioButton`](/versions/v58.0.0/sdk/ui/jetpack-compose/radiobutton.md)                             | RadioButton component for single-selection controls.                                                             |
| [`RNHostView`](/versions/v58.0.0/sdk/ui/jetpack-compose/rnhostview.md)                               | A component that enables React Native views inside Jetpack Compose.                                              |
| [`Row`](/versions/v58.0.0/sdk/ui/jetpack-compose/row.md)                                             | Row component for placing children horizontally.                                                                 |
| [`SearchBar`](/versions/v58.0.0/sdk/ui/jetpack-compose/searchbar.md)                                 | SearchBar component for search input functionality.                                                              |
| [`SegmentedButton`](/versions/v58.0.0/sdk/ui/jetpack-compose/segmentedbutton.md)                     | Segmented Button components for single or multi-choice selection.                                                |
| [`Shape`](/versions/v58.0.0/sdk/ui/jetpack-compose/shape.md)                                         | Shape component for drawing geometric shapes.                                                                    |
| [`Slider`](/versions/v58.0.0/sdk/ui/jetpack-compose/slider.md)                                       | Slider component for selecting values from a range.                                                              |
| [`Snackbar`](/versions/v58.0.0/sdk/ui/jetpack-compose/snackbar.md)                                   | A brief notification that appears at the bottom of the screen to provide feedback without interrupting the user. |
| [`Spacer`](/versions/v58.0.0/sdk/ui/jetpack-compose/spacer.md)                                       | Spacer component for adding flexible space between elements.                                                     |
| [`Surface`](/versions/v58.0.0/sdk/ui/jetpack-compose/surface.md)                                     | Surface component for styled content containers.                                                                 |
| [`Switch`](/versions/v58.0.0/sdk/ui/jetpack-compose/switch.md)                                       | Switch component for toggle controls.                                                                            |
| [`Text`](/versions/v58.0.0/sdk/ui/jetpack-compose/text.md)                                           | Text component for displaying styled text.                                                                       |
| [`TextField`](/versions/v58.0.0/sdk/ui/jetpack-compose/textfield.md)                                 | TextField components for native Material3 text input.                                                            |
| [`ToggleButton`](/versions/v58.0.0/sdk/ui/jetpack-compose/togglebutton.md)                           | ToggleButton components for displaying native Material3 toggle buttons.                                          |
| [`Tooltip`](/versions/v58.0.0/sdk/ui/jetpack-compose/tooltip.md)                                     | Tooltip components for displaying contextual information on long-press.                                          |
| [`useNativeState`](/versions/v58.0.0/sdk/ui/jetpack-compose/usenativestate.md)                       | A React hook that creates observable state shared between JavaScript and native Jetpack Compose views.           |

### SwiftUI

| Component                                                                                     | Description                                                                                     |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`AccessoryWidgetBackground`](/versions/v58.0.0/sdk/ui/swift-ui/accessorywidgetbackground.md) | Adaptive background view that provides a standard appearance based on the widget's environment. |
| [`Alert`](/versions/v58.0.0/sdk/ui/swift-ui/alert.md)                                         | Alert component for presenting native iOS alert dialogs.                                        |
| [`BottomSheet`](/versions/v58.0.0/sdk/ui/swift-ui/bottomsheet.md)                             | BottomSheet component that presents content from the bottom of the screen.                      |
| [`Button`](/versions/v58.0.0/sdk/ui/swift-ui/button.md)                                       | Button component for displaying native buttons.                                                 |
| [`ColorPicker`](/versions/v58.0.0/sdk/ui/swift-ui/colorpicker.md)                             | ColorPicker component for selecting colors.                                                     |
| [`ConfirmationDialog`](/versions/v58.0.0/sdk/ui/swift-ui/confirmationdialog.md)               | ConfirmationDialog component for presenting confirmation prompts.                               |
| [`ContextMenu`](/versions/v58.0.0/sdk/ui/swift-ui/contextmenu.md)                             | ContextMenu component for displaying context menus.                                             |
| [`ControlGroup`](/versions/v58.0.0/sdk/ui/swift-ui/controlgroup.md)                           | ControlGroup component for grouping interactive controls.                                       |
| [`DatePicker`](/versions/v58.0.0/sdk/ui/swift-ui/datepicker.md)                               | DatePicker component for selecting dates and times.                                             |
| [`DisclosureGroup`](/versions/v58.0.0/sdk/ui/swift-ui/disclosuregroup.md)                     | DisclosureGroup component for displaying expandable content.                                    |
| [`Divider`](/versions/v58.0.0/sdk/ui/swift-ui/divider.md)                                     | Divider component for creating visual separators.                                               |
| [`Form`](/versions/v58.0.0/sdk/ui/swift-ui/form.md)                                           | Form component for collecting user input in a structured layout.                                |
| [`Gauge`](/versions/v58.0.0/sdk/ui/swift-ui/gauge.md)                                         | Gauge component for displaying progress with visual indicators.                                 |
| [`Group`](/versions/v58.0.0/sdk/ui/swift-ui/group.md)                                         | Group component for grouping views without affecting layout.                                    |
| [`Host`](/versions/v58.0.0/sdk/ui/swift-ui/host.md)                                           | Host component that enables SwiftUI components in React Native.                                 |
| [`HStack`](/versions/v58.0.0/sdk/ui/swift-ui/hstack.md)                                       | HStack component for horizontal layouts.                                                        |
| [`Image`](/versions/v58.0.0/sdk/ui/swift-ui/image.md)                                         | Image component for displaying SF Symbols.                                                      |
| [`Label`](/versions/v58.0.0/sdk/ui/swift-ui/label.md)                                         | Label component for displaying text with an icon.                                               |
| [`LazyHStack`](/versions/v58.0.0/sdk/ui/swift-ui/lazyhstack.md)                               | LazyHStack component for lazy horizontal layouts.                                               |
| [`LazyVStack`](/versions/v58.0.0/sdk/ui/swift-ui/lazyvstack.md)                               | LazyVStack component for lazy vertical layouts.                                                 |
| [`Link`](/versions/v58.0.0/sdk/ui/swift-ui/link.md)                                           | Link component for displaying clickable links.                                                  |
| [`List`](/versions/v58.0.0/sdk/ui/swift-ui/list.md)                                           | List component for displaying scrollable lists of items.                                        |
| [`Menu`](/versions/v58.0.0/sdk/ui/swift-ui/menu.md)                                           | Menu component for displaying dropdown menus.                                                   |
| [`Modifiers`](/versions/v58.0.0/sdk/ui/swift-ui/modifiers.md)                                 | View modifiers for customizing component appearance and behavior.                               |
| [`Namespace`](/versions/v58.0.0/sdk/ui/swift-ui/namespace.md)                                 | A Namespace component that allows you create Namespaces in SwiftUI                              |
| [`Overlay`](/versions/v58.0.0/sdk/ui/swift-ui/overlay.md)                                     | Overlay component for layering content on top of another view.                                  |
| [`Picker`](/versions/v58.0.0/sdk/ui/swift-ui/picker.md)                                       | Picker component for selecting options from a list.                                             |
| [`Popover`](/versions/v58.0.0/sdk/ui/swift-ui/popover.md)                                     | Popover component for displaying content in a floating overlay.                                 |
| [`ProgressView`](/versions/v58.0.0/sdk/ui/swift-ui/progressview.md)                           | ProgressView component for displaying progress indicators.                                      |
| [`RNHostView`](/versions/v58.0.0/sdk/ui/swift-ui/rnhostview.md)                               | A component that enables React Native views inside SwiftUI.                                     |
| [`ScrollView`](/versions/v58.0.0/sdk/ui/swift-ui/scrollview.md)                               | ScrollView component for scrollable content.                                                    |
| [`Section`](/versions/v58.0.0/sdk/ui/swift-ui/section.md)                                     | Section component for grouping content within lists and forms.                                  |
| [`SecureField`](/versions/v58.0.0/sdk/ui/swift-ui/securefield.md)                             | SecureField component for password input.                                                       |
| [`Slider`](/versions/v58.0.0/sdk/ui/swift-ui/slider.md)                                       | Slider component for selecting values from a range.                                             |
| [`Spacer`](/versions/v58.0.0/sdk/ui/swift-ui/spacer.md)                                       | Spacer component for flexible spacing.                                                          |
| [`SwipeActions`](/versions/v58.0.0/sdk/ui/swift-ui/swipeactions.md)                           | SwipeActions component for adding leading and trailing swipe actions to row content.            |
| [`TabView`](/versions/v58.0.0/sdk/ui/swift-ui/tabview.md)                                     | TabView component for paged or tabbed content.                                                  |
| [`Text`](/versions/v58.0.0/sdk/ui/swift-ui/text.md)                                           | Text component for displaying styled text with support for nested texts.                        |
| [`TextField`](/versions/v58.0.0/sdk/ui/swift-ui/textfield.md)                                 | TextField component for text input.                                                             |
| [`Toggle`](/versions/v58.0.0/sdk/ui/swift-ui/toggle.md)                                       | Toggle component for displaying native toggles.                                                 |
| [`useNativeState`](/versions/v58.0.0/sdk/ui/swift-ui/usenativestate.md)                       | A React hook that creates observable state shared between JavaScript and native SwiftUI views.  |
| [`VStack`](/versions/v58.0.0/sdk/ui/swift-ui/vstack.md)                                       | VStack component for vertical layouts.                                                          |
| [`ZStack`](/versions/v58.0.0/sdk/ui/swift-ui/zstack.md)                                       | ZStack component for overlapping layouts.                                                       |

### Drop-in replacements

| Component                                                                               | Description                                                                            |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`BottomSheet`](/versions/v58.0.0/sdk/ui/drop-in-replacements/bottomsheet.md)           | A bottom sheet compatible with @gorhom/bottom-sheet.                                   |
| [`DateTimePicker`](/versions/v58.0.0/sdk/ui/drop-in-replacements/datetimepicker.md)     | A date and time picker compatible with @react-native-community/datetimepicker.         |
| [`MaskedView`](/versions/v58.0.0/sdk/ui/drop-in-replacements/maskedview.md)             | A masked view compatible with @react-native-masked-view/masked-view.                   |
| [`Menu`](/versions/v58.0.0/sdk/ui/drop-in-replacements/menu.md)                         | A menu compatible with @react-native-menu/menu.                                        |
| [`PagerView`](/versions/v58.0.0/sdk/ui/drop-in-replacements/pagerview.md)               | A horizontally paged view compatible with react-native-pager-view.                     |
| [`Picker`](/versions/v58.0.0/sdk/ui/drop-in-replacements/picker.md)                     | A picker compatible with @react-native-picker/picker.                                  |
| [`SegmentedControl`](/versions/v58.0.0/sdk/ui/drop-in-replacements/segmentedcontrol.md) | A segmented control compatible with @react-native-segmented-control/segmented-control. |
| [`Slider`](/versions/v58.0.0/sdk/ui/drop-in-replacements/slider.md)                     | A slider compatible with @react-native-community/slider.                               |

### Universal

| Component                                                          | Description                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [`BottomSheet`](/versions/v58.0.0/sdk/ui/universal/bottomsheet.md) | A modal sheet that slides up from the bottom of the screen.                                               |
| [`Button`](/versions/v58.0.0/sdk/ui/universal/button.md)           | A pressable button with multiple visual variants.                                                         |
| [`Checkbox`](/versions/v58.0.0/sdk/ui/universal/checkbox.md)       | A toggle control that represents a checked or unchecked state.                                            |
| [`Collapsible`](/versions/v58.0.0/sdk/ui/universal/collapsible.md) | A labelled tappable header that toggles visibility of its content.                                        |
| [`Column`](/versions/v58.0.0/sdk/ui/universal/column.md)           | A vertical layout container for universal @expo/ui components.                                            |
| [`FieldGroup`](/versions/v58.0.0/sdk/ui/universal/fieldgroup.md)   | A scrollable container of grouped settings-style rows.                                                    |
| [`Host`](/versions/v58.0.0/sdk/ui/universal/host.md)               | A cross-platform Host component that wraps universal @expo/ui content.                                    |
| [`Icon`](/versions/v58.0.0/sdk/ui/universal/icon.md)               | A platform-native icon — SF Symbol on iOS, Material Symbol on Android.                                    |
| [`List`](/versions/v58.0.0/sdk/ui/universal/list.md)               | A virtualized vertical container of rows, paired with a tappable ListItem primitive.                      |
| [`Picker`](/versions/v58.0.0/sdk/ui/universal/picker.md)           | A single-selection input with menu and wheel appearances.                                                 |
| [`RNHostView`](/versions/v58.0.0/sdk/ui/universal/rnhostview.md)   | A cross-platform component for hosting React Native views inside @expo/ui views.                          |
| [`Row`](/versions/v58.0.0/sdk/ui/universal/row.md)                 | A horizontal layout container for universal @expo/ui components.                                          |
| [`ScrollView`](/versions/v58.0.0/sdk/ui/universal/scrollview.md)   | A scrollable container that supports vertical or horizontal scrolling.                                    |
| [`Slider`](/versions/v58.0.0/sdk/ui/universal/slider.md)           | A control for selecting a value from a continuous or stepped range.                                       |
| [`Spacer`](/versions/v58.0.0/sdk/ui/universal/spacer.md)           | A layout spacer that produces empty space between siblings.                                               |
| [`Switch`](/versions/v58.0.0/sdk/ui/universal/switch.md)           | A toggle control that switches between on and off states.                                                 |
| [`Text`](/versions/v58.0.0/sdk/ui/universal/text.md)               | A component for displaying styled text content.                                                           |
| [`TextInput`](/versions/v58.0.0/sdk/ui/universal/textinput.md)     | A text input backed by native SwiftUI and Jetpack Compose components, with a React Native-compatible API. |
