"""
Learning Path Service — Revolutionary Feature #2
Generates personalized learning paths based on what the user has scanned.
"""

from typing import Literal

ContentType = Literal[
    'code', 'architecture-diagram', 'dense-text', 'data-visualization',
    'ui-design', 'mathematical', 'table', 'image', 'unknown',
]

ExplanationMode = Literal['eli5', 'technical', 'summary', 'code-review', 'translate']

# Curated learning resources per content type
LEARNING_RESOURCES: dict[str, list[dict]] = {
    'code': [
        {
            'title': 'Clean Code: A Handbook of Agile Software Craftsmanship',
            'url': 'https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882',
            'type': 'course', 'platform': 'Amazon Books',
        },
        {
            'title': 'Refactoring.Guru — Design Patterns',
            'url': 'https://refactoring.guru/design-patterns',
            'type': 'documentation', 'platform': 'Refactoring.Guru',
        },
        {
            'title': 'The Pragmatic Programmer',
            'url': 'https://pragprog.com/titles/tpp20/the-pragmatic-programmer-20th-anniversary-edition/',
            'type': 'course', 'platform': 'Pragmatic Programmers',
        },
        {
            'title': 'Exercism — Practice coding in 65 languages',
            'url': 'https://exercism.org',
            'type': 'tutorial', 'platform': 'Exercism',
        },
    ],
    'architecture-diagram': [
        {
            'title': 'Designing Data-Intensive Applications — Martin Kleppmann',
            'url': 'https://dataintensive.net',
            'type': 'course', 'platform': 'O\'Reilly',
        },
        {
            'title': 'The System Design Primer',
            'url': 'https://github.com/donnemartin/system-design-primer',
            'type': 'documentation', 'platform': 'GitHub',
        },
        {
            'title': 'AWS Well-Architected Framework',
            'url': 'https://aws.amazon.com/architecture/well-architected/',
            'type': 'documentation', 'platform': 'AWS',
        },
        {
            'title': 'ByteByteGo Newsletter — System Design',
            'url': 'https://bytebytego.com',
            'type': 'tutorial', 'platform': 'ByteByteGo',
        },
    ],
    'data-visualization': [
        {
            'title': 'Fundamentals of Data Visualization — Claus Wilke',
            'url': 'https://clauswilke.com/dataviz/',
            'type': 'course', 'platform': 'Free Online',
        },
        {
            'title': 'D3.js in Action',
            'url': 'https://www.manning.com/books/d3js-in-action-third-edition',
            'type': 'course', 'platform': 'Manning',
        },
        {
            'title': 'Storytelling with Data',
            'url': 'https://www.storytellingwithdata.com',
            'type': 'tutorial', 'platform': 'SWD',
        },
    ],
    'mathematical': [
        {
            'title': '3Blue1Brown — Visual Math Explanations',
            'url': 'https://www.3blue1brown.com',
            'type': 'video', 'platform': 'YouTube',
        },
        {
            'title': 'Khan Academy — Mathematics',
            'url': 'https://www.khanacademy.org/math',
            'type': 'course', 'platform': 'Khan Academy',
        },
        {
            'title': 'Paul\'s Online Math Notes',
            'url': 'https://tutorial.math.lamar.edu',
            'type': 'documentation', 'platform': 'Lamar University',
        },
    ],
    'ui-design': [
        {
            'title': 'Laws of UX',
            'url': 'https://lawsofux.com',
            'type': 'documentation', 'platform': 'Laws of UX',
        },
        {
            'title': 'Figma Learn',
            'url': 'https://help.figma.com/hc/en-us/categories/360002042553-Figma-design',
            'type': 'tutorial', 'platform': 'Figma',
        },
        {
            'title': 'Nielsen Norman Group UX Research',
            'url': 'https://www.nngroup.com/articles/',
            'type': 'documentation', 'platform': 'NNGroup',
        },
    ],
    'dense-text': [
        {
            'title': 'How to Read a Book — Mortimer Adler',
            'url': 'https://www.amazon.com/How-Read-Book-Classic-Intelligent/dp/0671212095',
            'type': 'course', 'platform': 'Books',
        },
        {
            'title': 'Zotero — Reference Manager',
            'url': 'https://www.zotero.org',
            'type': 'tutorial', 'platform': 'Zotero',
        },
    ],
}

DIFFICULTY_MAP: dict[str, dict[str, str]] = {
    'eli5':        {'difficulty': 'beginner',     'time': '30-60 min'},
    'technical':   {'difficulty': 'advanced',     'time': '2-4 hours'},
    'summary':     {'difficulty': 'intermediate', 'time': '1-2 hours'},
    'code-review': {'difficulty': 'intermediate', 'time': '1-3 hours'},
    'translate':   {'difficulty': 'beginner',     'time': '20-30 min'},
}


class LearningPathService:
    async def suggest(
        self,
        content_type: str,
        mode: str,
        explanation_snippet: str,
    ) -> list[dict]:
        resources = LEARNING_RESOURCES.get(content_type, LEARNING_RESOURCES.get('dense-text', []))
        diff_info = DIFFICULTY_MAP.get(mode, {'difficulty': 'intermediate', 'time': '1-2 hours'})

        if not resources:
            return []

        # Build two paths: Quick Reference and Deep Dive
        paths = [
            {
                'id': f'path_{content_type}_quick',
                'title': f'Quick Reference: {content_type.replace("-", " ").title()}',
                'description': f'Get up to speed on {content_type.replace("-", " ")} concepts fast',
                'resources': resources[:2],
                'estimated_time': '30-60 min',
                'difficulty': 'beginner',
                'relevance_score': 0.85,
            },
            {
                'id': f'path_{content_type}_deep',
                'title': f'Deep Dive: Master {content_type.replace("-", " ").title()}',
                'description': f'Comprehensive learning path for {content_type.replace("-", " ")}',
                'resources': resources,
                'estimated_time': diff_info['time'],
                'difficulty': diff_info['difficulty'],
                'relevance_score': 0.72,
            },
        ]

        return paths
