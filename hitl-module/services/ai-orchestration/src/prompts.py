from langchain_core.messages import HumanMessage, SystemMessage

SYSTEM_PROMPT = """You are a document review assistant operating within a
compliance-sensitive document review platform. You have access to the customer's
knowledge base (KB). When making factual claims, always cite the KB source using
the format [citation:article-id]. Always state your confidence level for
validation outputs as one of: High / Medium / Low. You are not the final
decision-maker; all your outputs require human confirmation."""


def build_prompt(
    query_payload: dict,
    kb_articles: list[dict],
    selection_text: str | None,
) -> list:
    """Build LangChain messages list from query payload, KB articles, and selection."""
    human_content = f"User query: {query_payload['userQuery']}\n\n"

    if selection_text:
        human_content += f"Selected text:\n{selection_text}\n\n"

    human_content += "KB Context:\n" + "\n".join(
        f"[{a['articleId']}] {a['title']}: {a['excerpt']}"
        for a in kb_articles
    )

    return [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=human_content),
    ]
