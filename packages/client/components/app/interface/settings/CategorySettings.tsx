import {
  BiRegularListUl,
  BiSolidInfoCircle,
  BiSolidTrash,
} from "solid-icons/bi";

import { Trans, useLingui } from "@lingui-solid/solid/macro";

import { useModals } from "@revolt/modal";
import { Button, ColouredText, Column, Text } from "@revolt/ui";

import { SettingsConfiguration } from ".";
import {
  CategoryContext,
  CategoryPermissionsOverview,
} from "./category/CategoryPermissionsOverview";
import { ChannelPermissionsEditor } from "./channel/permissions/ChannelPermissionsEditor";

const categoryOf = (context: CategoryContext) =>
  context.server.categories?.find(
    (category) => category.id === context.categoryId,
  );

const Config: SettingsConfiguration<CategoryContext> = {
  /**
   * Page titles
   */
  title(ctx, key) {
    const { t } = useLingui();

    if (key.startsWith("permissions/")) {
      if (key === "permissions/default") return t`Default Permissions`;

      return ctx.context.server.roles.get(key.substring(12))?.name ?? "";
    }

    return ctx.entries
      .flatMap((category) => category.entries)
      .find((entry) => entry.id === key)?.title as string;
  },

  /**
   * Render the current category settings page
   */
  // we take care of the reactivity ourselves
  /* eslint-disable solid/components-return-once */
  render(props, context) {
    const id = props.page();
    const { openModal } = useModals();

    if (id?.startsWith("permissions/")) {
      if (id === "permissions/default") {
        return (
          <ChannelPermissionsEditor
            type="category_default"
            context={context.server}
            categoryId={context.categoryId}
          />
        );
      }

      return (
        <ChannelPermissionsEditor
          type="category_role"
          context={context.server}
          categoryId={context.categoryId}
          roleId={id.substring(12)}
        />
      );
    }

    switch (id) {
      case "overview":
        return (
          <Column gap="md">
            <Text class="label">
              <Trans>Name</Trans>
            </Text>
            <Text>{categoryOf(context)?.title}</Text>
            <Button
              onPress={() =>
                openModal({
                  type: "edit_category",
                  server: context.server,
                  category: {
                    ...categoryOf(context)!,
                    channels:
                      context.server.orderedChannels.find(
                        (category) => category.id === context.categoryId,
                      )?.channels ?? [],
                  },
                })
              }
            >
              <Trans>Rename category</Trans>
            </Button>
          </Column>
        );
      case "permissions":
        return <CategoryPermissionsOverview context={context} />;
      default:
        return null;
    }
  },
  /* eslint-enable solid/components-return-once */

  /**
   * Generate list of entries for category settings
   */
  list(context) {
    const { openModal } = useModals();

    return {
      context,
      entries: [
        {
          title: categoryOf(context)?.title,
          entries: [
            {
              id: "overview",
              icon: <BiSolidInfoCircle size={20} />,
              title: <Trans>Overview</Trans>,
            },
            {
              hidden: !context.server.havePermission("ManagePermissions"),
              id: "permissions",
              icon: <BiRegularListUl size={20} />,
              title: <Trans>Permissions</Trans>,
            },
          ],
        },
        {
          hidden: !context.server.havePermission("ManageChannel"),
          entries: [
            {
              icon: (
                <BiSolidTrash size={20} color="var(--md-sys-color-error)" />
              ),
              title: (
                <ColouredText colour="var(--md-sys-color-error)">
                  <Trans>Delete Category</Trans>
                </ColouredText>
              ),
              onClick() {
                openModal({
                  type: "delete_category",
                  server: context.server,
                  categoryId: context.categoryId,
                });
              },
            },
          ],
        },
      ],
    };
  },
};

export default Config;
