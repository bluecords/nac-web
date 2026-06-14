import { useNavigate } from "@solidjs/router";
import { Match, Switch } from "solid-js";

import { Trans } from "@lingui-solid/solid/macro";
import { PublicChannelInvite } from "stoat.js";
import { styled } from "styled-system/jsx";

import MdGroups3 from "@material-design-icons/svg/filled/groups_3.svg?component-solid";
import MdBugReport from "@material-design-icons/svg/outlined/bug_report.svg?component-solid";
import MdFormatListNumbered from "@material-design-icons/svg/outlined/format_list_numbered.svg?component-solid";
import MdStar from "@material-design-icons/svg/outlined/star_outline.svg?component-solid";

import { useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { useModals } from "@revolt/modal";
import { CategoryButton, Column, iconSize } from "@revolt/ui";

/**
 * Feedback
 */
export function Feedback() {
  const { openModal, pop } = useModals();
  const navigate = useNavigate();
  const client = useClient();

  const showLoungeButton = CONFIGURATION.IS_STOAT;
  const isInLounge =
    client()!.servers.get("01F7ZSBSFHQ8TA81725KQCSDDP") !== undefined;

  return (
    <Column gap="lg">
      <CategoryButton.Group>
        {/* <Link
          href="https://example.com"
          target="_blank"
        >
          <CategoryButton
            action="external"
            icon={<MdViewKanban {...iconSize(22)} />}
            onClick={() => void 0}
            description={<Trans>See what we're currently working on.</Trans>}
          >
            <Trans>Roadmap</Trans>
          </CategoryButton>
        </Link> */}
        <Link
          href="https://github.com/bluecords/nac-web/discussions"
          target="_blank"
        >
          <CategoryButton
            action="external"
            icon={<MdStar {...iconSize(22)} />}
            onClick={() => void 0}
            description={
              <Trans>Suggest new NAC features on GitHub discussions.</Trans>
            }
          >
            <Trans>Submit feature suggestion</Trans>
          </CategoryButton>
        </Link>
        <Link
          href="https://github.com/bluecords/nac-web/discussions"
          target="_blank"
        >
          <CategoryButton
            action="external"
            icon={<MdFormatListNumbered {...iconSize(22)} />}
            onClick={() => void 0}
            description={<Trans>Submit feedback on GitHub discussions.</Trans>}
          >
            <Trans>Feedback</Trans>
          </CategoryButton>
        </Link>
        <Link
          href="https://github.com/bluecords/nac-web/issues"
          target="_blank"
        >
          <CategoryButton
            action="external"
            icon={<MdBugReport {...iconSize(22)} />}
            onClick={() => void 0}
            description={<Trans>View currently active bug reports here.</Trans>}
          >
            <Trans>Bug Tracker</Trans>
          </CategoryButton>
        </Link>
        {null}
      </CategoryButton.Group>
    </Column>
  );
}

/**
 * Link without decorations
 */
const Link = styled("a", {
  base: {
    textDecoration: "none",
  },
});
