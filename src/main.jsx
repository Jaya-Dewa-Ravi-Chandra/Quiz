import React, {
  useEffect,
  useState
} from "react";

import {
  createRoot
} from "react-dom/client";

import "./style.css";

/*
====================================================
QUESTION TEMPLATE
====================================================
*/

const emptyQuestion = () => ({
  question: "",

  options: [
    {
      text: "",
      imageUrl: ""
    },
    {
      text: "",
      imageUrl: ""
    },
    {
      text: "",
      imageUrl: ""
    },
    {
      text: "",
      imageUrl: ""
    }
  ],

  correctAnswer: 0,

  explanation: "",

  timerSeconds: 30
});

/*
====================================================
API HELPER
====================================================
*/

async function api(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "Content-Type":
            "application/json",

          ...(options.headers || {})
        },

        ...options
      }
    );

  const data =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Server request failed."
    );
  }

  return data;
}

/*
====================================================
APP
====================================================
*/

function App() {

  /*
  -----------------------------------------------
  GENERAL STATE
  -----------------------------------------------
  */

  const [
    page,
    setPage
  ] = useState("home");

  const [
    quizzes,
    setQuizzes
  ] = useState([]);

  const [
    error,
    setError
  ] = useState("");

  const [
    status,
    setStatus
  ] = useState(
    "DATABASE LINK ACTIVE"
  );

  /*
  -----------------------------------------------
  BUILDER STATE
  -----------------------------------------------
  */

  const [
    editingId,
    setEditingId
  ] = useState(null);

  const [
    title,
    setTitle
  ] = useState("");

  const [
    description,
    setDescription
  ] = useState("");

  const [
    questions,
    setQuestions
  ] = useState([]);

  /*
  -----------------------------------------------
  PLAYER STATE
  -----------------------------------------------
  */

  const [
    activeQuiz,
    setActiveQuiz
  ] = useState(null);

  const [
    current,
    setCurrent
  ] = useState(0);

  const [
    selected,
    setSelected
  ] = useState(null);

  const [
    locked,
    setLocked
  ] = useState(false);

  const [
    remaining,
    setRemaining
  ] = useState(0);

  const [
    total,
    setTotal
  ] = useState(30);

  const [
    score,
    setScore
  ] = useState(0);

  /*
  -----------------------------------------------
  LOAD QUIZZES
  -----------------------------------------------
  */

  const loadQuizzes =
    async () => {

      try {

        const data =
          await api(
            "/api/quizzes"
          );

        setQuizzes(
          data
        );

        setStatus(
          "DATABASE LINK ACTIVE"
        );

        setError("");

      } catch (e) {

        setStatus(
          "DATABASE LINK ERROR"
        );

        setError(
          e.message
        );
      }
    };

  useEffect(
    () => {
      loadQuizzes();
    },
    []
  );

  /*
  -----------------------------------------------
  NAVIGATION
  -----------------------------------------------
  */

  const go =
    nextPage => {

      setPage(
        nextPage
      );

      if (
        nextPage ===
        "quizzes"
      ) {
        loadQuizzes();
      }
    };

  /*
  -----------------------------------------------
  NEW QUIZ
  -----------------------------------------------
  */

  const createQuiz =
    () => {

      setEditingId(
        null
      );

      setTitle("");

      setDescription("");

      setQuestions([
        emptyQuestion()
      ]);

      go(
        "builder"
      );
    };

  /*
  -----------------------------------------------
  EDIT QUIZ
  -----------------------------------------------
  */

  const editQuiz =
    async id => {

      try {

        const quiz =
          await api(
            `/api/quizzes/${id}`
          );

        setEditingId(
          quiz._id
        );

        setTitle(
          quiz.title
        );

        setDescription(
          quiz.description ||
          ""
        );

        /*
        Make old string options compatible
        with the new image structure.
        */

        const normalized =
          quiz.questions.map(
            question => ({
              ...question,

              options:
                question.options.map(
                  option => {

                    if (
                      typeof option ===
                      "string"
                    ) {
                      return {
                        text:
                          option,

                        imageUrl:
                          ""
                      };
                    }

                    return {
                      text:
                        option.text ||
                        "",

                      imageUrl:
                        option.imageUrl ||
                        ""
                    };
                  }
                )
            })
          );

        setQuestions(
          normalized
        );

        go(
          "builder"
        );

      } catch (e) {

        alert(
          e.message
        );
      }
    };

  /*
  -----------------------------------------------
  UPDATE QUESTION
  -----------------------------------------------
  */

  const updateQuestion =
    (
      questionIndex,
      patch
    ) => {

      setQuestions(
        previous =>
          previous.map(
            (
              question,
              index
            ) =>
              index ===
              questionIndex
                ? {
                    ...question,
                    ...patch
                  }
                : question
          )
      );
    };

  /*
  -----------------------------------------------
  UPDATE OPTION
  -----------------------------------------------
  */

  const updateOption =
    (
      questionIndex,
      optionIndex,
      patch
    ) => {

      setQuestions(
        previous =>
          previous.map(
            (
              question,
              index
            ) => {

              if (
                index !==
                questionIndex
              ) {
                return question;
              }

              return {
                ...question,

                options:
                  question.options.map(
                    (
                      option,
                      i
                    ) =>
                      i ===
                      optionIndex
                        ? {
                            ...option,
                            ...patch
                          }
                        : option
                  )
              };
            }
          )
      );
    };

  /*
  -----------------------------------------------
  IMAGE UPLOAD
  -----------------------------------------------
  */

  const uploadOptionImage =
    async (
      questionIndex,
      optionIndex,
      file
    ) => {

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {

        alert(
          "Please select an image file."
        );

        return;
      }

      /*
      10 MB browser-side check
      */

      if (
        file.size >
        10 * 1024 * 1024
      ) {

        alert(
          "Image must be smaller than 10 MB."
        );

        return;
      }

      try {

        /*
        Convert image into Base64.
        */

        const dataUrl =
          await new Promise(
            (
              resolve,
              reject
            ) => {

              const reader =
                new FileReader();

              reader.onload =
                () =>
                  resolve(
                    reader.result
                  );

              reader.onerror =
                reject;

              reader.readAsDataURL(
                file
              );
            }
          );

        /*
        Send image to Node.
        Node stores it in MongoDB GridFS.
        */

        const result =
          await api(
            "/api/images",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  dataUrl,
                  filename:
                    file.name
                })
            }
          );

        /*
        Save returned image URL
        inside the option.
        */

        updateOption(
          questionIndex,
          optionIndex,
          {
            imageUrl:
              result.imageUrl
          }
        );

      } catch (e) {

        alert(
          `IMAGE UPLOAD FAILED: ${e.message}`
        );
      }
    };

  /*
  -----------------------------------------------
  SAVE QUIZ
  -----------------------------------------------
  */

  const saveQuiz =
    async () => {

      if (
        !title.trim()
      ) {

        alert(
          "Enter a quiz title."
        );

        return;
      }

      if (
        !questions.length
      ) {

        alert(
          "Add at least one question."
        );

        return;
      }

      const invalid =
        questions.some(
          question =>
            !question.question.trim() ||
            question.options.length !== 4 ||
            question.options.some(
              option =>
                !option.text.trim()
            )
        );

      if (invalid) {

        alert(
          "Complete every question and all four option texts."
        );

        return;
      }

      const payload = {

        title:
          title.trim(),

        description:
          description.trim(),

        questions
      };

      try {

        if (
          editingId
        ) {

          await api(
            `/api/quizzes/${editingId}`,
            {
              method:
                "PUT",

              body:
                JSON.stringify(
                  payload
                )
            }
          );

        } else {

          await api(
            "/api/quizzes",
            {
              method:
                "POST",

              body:
                JSON.stringify(
                  payload
                )
            }
          );
        }

        alert(
          "QUIZ SAVED TO MONGODB ATLAS."
        );

        go(
          "quizzes"
        );

      } catch (e) {

        alert(
          `SAVE FAILED: ${e.message}`
        );
      }
    };

  /*
  -----------------------------------------------
  DELETE QUIZ
  -----------------------------------------------
  */

  const deleteQuiz =
    async id => {

      if (
        !confirm(
          "Delete this quiz and its option images from MongoDB Atlas?"
        )
      ) {
        return;
      }

      try {

        await api(
          `/api/quizzes/${id}`,
          {
            method:
              "DELETE"
          }
        );

        loadQuizzes();

      } catch (e) {

        alert(
          e.message
        );
      }
    };

  /*
  -----------------------------------------------
  LAUNCH QUIZ
  -----------------------------------------------
  */

  const launch =
    async id => {

      try {

        const quiz =
          await api(
            `/api/quizzes/${id}`
          );

        if (
          !quiz.questions?.length
        ) {

          throw new Error(
            "This quiz has no questions."
          );
        }

        const first =
          quiz.questions[0];

        const seconds =
          Math.max(
            1,
            Number(
              first.timerSeconds
            ) || 30
          );

        setActiveQuiz(
          quiz
        );

        setCurrent(
          0
        );

        setScore(
          0
        );

        setSelected(
          null
        );

        setLocked(
          false
        );

        /*
        IMPORTANT:
        Initialize timer BEFORE entering player.
        */

        setTotal(
          seconds
        );

        setRemaining(
          seconds
        );

        go(
          "player"
        );

      } catch (e) {

        alert(
          e.message
        );
      }
    };

  /*
  -----------------------------------------------
  INITIALIZE EACH QUESTION
  -----------------------------------------------
  */

  useEffect(
    () => {

      if (
        page !==
          "player" ||
        !activeQuiz
      ) {
        return;
      }

      const question =
        activeQuiz.questions[
          current
        ];

      if (!question) {
        return;
      }

      const seconds =
        Math.max(
          1,
          Number(
            question.timerSeconds
          ) || 30
        );

      setTotal(
        seconds
      );

      setRemaining(
        seconds
      );

      setSelected(
        null
      );

      setLocked(
        false
      );

    },
    [
      page,
      current,
      activeQuiz
    ]
  );

  /*
  -----------------------------------------------
  TIMER
  -----------------------------------------------
  */

  useEffect(
    () => {

      if (
        page !==
          "player" ||
        !activeQuiz ||
        locked
      ) {
        return;
      }

      if (
        remaining <= 0
      ) {

        reveal(
          null,
          true
        );

        return;
      }

      const timer =
        setTimeout(
          () => {

            setRemaining(
              value =>
                Math.max(
                  0,
                  value - 1
                )
            );

          },
          1000
        );

      return () =>
        clearTimeout(
          timer
        );

    },
    [
      remaining,
      page,
      locked,
      activeQuiz
    ]
  );

  /*
  -----------------------------------------------
  REVEAL ANSWER
  -----------------------------------------------
  */

  const reveal =
    (
      choice,
      timedOut = false
    ) => {

      if (
        locked ||
        !activeQuiz
      ) {
        return;
      }

      const question =
        activeQuiz.questions[
          current
        ];

      setSelected(
        choice
      );

      setLocked(
        true
      );

      if (
        choice ===
        question.correctAnswer
      ) {

        setScore(
          value =>
            value + 1
        );
      }
    };

  /*
  -----------------------------------------------
  NEXT QUESTION
  -----------------------------------------------
  */

  const next =
    () => {

      if (
        current <
        activeQuiz.questions.length - 1
      ) {

        setCurrent(
          value =>
            value + 1
        );

      } else {

        go(
          "result"
        );
      }
    };

  /*
  -----------------------------------------------
  RESULT
  -----------------------------------------------
  */

  const percentage =
    activeQuiz
      ? Math.round(
          (
            score /
            activeQuiz.questions.length
          ) * 100
        )
      : 0;

  /*
  ==================================================
  RENDER
  ==================================================
  */

  return (
    <>
      <header>

        <div className="logo">
          QUIZ CORE
        </div>

        <div
          className={
            `status ${
              status.includes(
                "ERROR"
              )
                ? "bad"
                : ""
            }`
          }
        >
          ● {status}
        </div>

        <nav>

          <button
            onClick={() =>
              go("home")
            }
          >
            HOME
          </button>

          <button
            onClick={() =>
              go("quizzes")
            }
          >
            QUIZZES
          </button>

          <button
            onClick={
              createQuiz
            }
          >
            CREATE
          </button>

        </nav>

      </header>

      <main>

        {/* =================================================
            HOME
        ================================================= */}

        {page === "home" && (

          <>

            <section
              className="panel hero"
            >

              <div className="sub">
                TACTICAL QUIZ INTERFACE //
                VITE + MONGODB ATLAS +
                GRIDFS
              </div>

              <h1>
                QUIZ COMMAND CENTER
              </h1>

              <p className="sub">
                Create MCQ quizzes with
                customizable timers,
                explanations and
                image-based options.
              </p>

              <div className="actions">

                <button
                  className="primary"
                  onClick={() =>
                    go("quizzes")
                  }
                >
                  ACCESS DATABASE
                </button>

                <button
                  onClick={
                    createQuiz
                  }
                >
                  INITIALIZE QUIZ
                </button>

              </div>

            </section>

            <section
              className="stats"
            >

              <div>
                QUIZZES

                <strong>
                  {
                    quizzes.length
                  }
                </strong>
              </div>

              <div>
                QUESTIONS

                <strong>
                  {
                    quizzes.reduce(
                      (
                        total,
                        quiz
                      ) =>
                        total +
                        quiz.questions.length,
                      0
                    )
                  }
                </strong>
              </div>

              <div>
                DATABASE

                <strong
                  className={
                    error
                      ? "red"
                      : "green"
                  }
                >
                  {
                    error
                      ? "ERROR"
                      : "ONLINE"
                  }
                </strong>
              </div>

            </section>

            {error && (

              <section
                className="panel error"
              >
                {error}
              </section>

            )}

            <section
              className="panel"
            >

              <div className="notice">

                <b>
                  IMAGE STORAGE:
                </b>

                Option images are
                uploaded to MongoDB Atlas
                using GridFS. The quiz
                stores the corresponding
                image URL.

              </div>

            </section>

          </>
        )}

        {/* =================================================
            QUIZ DATABASE
        ================================================= */}

        {page === "quizzes" && (

          <>

            <section
              className="panel"
            >

              <div className="sub">
                MONGODB ATLAS //
                QUIZ COLLECTION
              </div>

              <h1>
                QUIZ DATABASE
              </h1>

              <div className="actions">

                <button
                  className="primary"
                  onClick={
                    createQuiz
                  }
                >
                  + CREATE QUIZ
                </button>

                <button
                  onClick={
                    loadQuizzes
                  }
                >
                  ↻ REFRESH
                </button>

              </div>

            </section>

            {error && (

              <div
                className="panel error"
              >
                {error}
              </div>

            )}

            {!quizzes.length ? (

              <div className="empty">
                NO QUIZZES FOUND //
                INITIALIZE YOUR FIRST QUIZ
              </div>

            ) : (

              quizzes.map(
                quiz => (

                  <div
                    className="quiz-card"
                    key={quiz._id}
                  >

                    <div>

                      <h3>
                        {quiz.title}
                      </h3>

                      <small>
                        {
                          quiz.description ||
                          "No description"
                        }

                        {" • "}

                        {
                          quiz.questions.length
                        }

                        {" QUESTIONS"}
                      </small>

                    </div>

                    <div className="actions">

                      <button
                        className="primary"
                        onClick={() =>
                          launch(
                            quiz._id
                          )
                        }
                      >
                        LAUNCH
                      </button>

                      <button
                        onClick={() =>
                          editQuiz(
                            quiz._id
                          )
                        }
                      >
                        EDIT
                      </button>

                      <button
                        className="danger"
                        onClick={() =>
                          deleteQuiz(
                            quiz._id
                          )
                        }
                      >
                        DELETE
                      </button>

                    </div>

                  </div>

                )
              )

            )}

          </>
        )}

        {/* =================================================
            QUIZ BUILDER
        ================================================= */}

        {page === "builder" && (

          <>

            <section
              className="panel"
            >

              <div className="sub">
                CONSTRUCTION MODULE
              </div>

              <h1>
                {
                  editingId
                    ? "EDIT QUIZ"
                    : "NEW QUIZ"
                }
              </h1>

              <label>
                QUIZ TITLE
              </label>

              <input
                value={title}
                onChange={e =>
                  setTitle(
                    e.target.value
                  )
                }
                placeholder="Operating Systems — Unit 1"
              />

              <label>
                DESCRIPTION
              </label>

              <textarea
                value={
                  description
                }
                onChange={e =>
                  setDescription(
                    e.target.value
                  )
                }
              />

              <div className="actions">

                <button
                  className="primary"
                  onClick={() =>
                    setQuestions(
                      previous => [
                        ...previous,
                        emptyQuestion()
                      ]
                    )
                  }
                >
                  + ADD QUESTION
                </button>

                <button
                  onClick={
                    saveQuiz
                  }
                >
                  SAVE TO ATLAS
                </button>

                <button
                  onClick={() =>
                    go("quizzes")
                  }
                >
                  CANCEL
                </button>

              </div>

            </section>

            {questions.map(
              (
                question,
                questionIndex
              ) => (

                <section
                  className="panel question-editor"
                  key={questionIndex}
                >

                  <div className="question-head">

                    <b>
                      QUESTION{" "}
                      {
                        String(
                          questionIndex + 1
                        ).padStart(
                          2,
                          "0"
                        )
                      }
                    </b>

                    <button
                      className="danger"
                      onClick={() => {

                        if (
                          questions.length ===
                          1
                        ) {

                          alert(
                            "A quiz needs at least one question."
                          );

                          return;
                        }

                        setQuestions(
                          previous =>
                            previous.filter(
                              (
                                _,
                                i
                              ) =>
                                i !==
                                questionIndex
                            )
                        );

                      }}
                    >
                      DELETE
                    </button>

                  </div>

                  <label>
                    QUESTION TEXT
                  </label>

                  <textarea
                    value={
                      question.question
                    }
                    onChange={e =>
                      updateQuestion(
                        questionIndex,
                        {
                          question:
                            e.target.value
                        }
                      )
                    }
                  />

                  <label>
                    TIME LIMIT —
                    SECONDS
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="3600"
                    value={
                      question.timerSeconds
                    }
                    onChange={e =>
                      updateQuestion(
                        questionIndex,
                        {
                          timerSeconds:
                            Math.max(
                              1,
                              Number(
                                e.target.value
                              ) || 1
                            )
                        }
                      )
                    }
                  />

                  <label>
                    OPTIONS
                  </label>

                  {question.options.map(
                    (
                      option,
                      optionIndex
                    ) => (

                      <div
                        className="option-editor"
                        key={optionIndex}
                      >

                        <div className="option-title">

                          <input
                            type="radio"
                            name={
                              `correct-${questionIndex}`
                            }
                            checked={
                              question.correctAnswer ===
                              optionIndex
                            }
                            onChange={() =>
                              updateQuestion(
                                questionIndex,
                                {
                                  correctAnswer:
                                    optionIndex
                                }
                              )
                            }
                          />

                          <strong>
                            OPTION{" "}
                            {
                              String.fromCharCode(
                                65 +
                                optionIndex
                              )
                            }
                          </strong>

                        </div>

                        <input
                          value={
                            option.text
                          }
                          placeholder={
                            `Option ${
                              String.fromCharCode(
                                65 +
                                optionIndex
                              )
                            } text`
                          }
                          onChange={e =>
                            updateOption(
                              questionIndex,
                              optionIndex,
                              {
                                text:
                                  e.target.value
                              }
                            )
                          }
                        />

                        <div className="upload-row">

                          <label className="upload-button">

                            📷 UPLOAD IMAGE

                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={e =>
                                uploadOptionImage(
                                  questionIndex,
                                  optionIndex,
                                  e.target.files?.[0]
                                )
                              }
                            />

                          </label>

                          {option.imageUrl && (

                            <button
                              type="button"
                              className="danger"
                              onClick={() =>
                                updateOption(
                                  questionIndex,
                                  optionIndex,
                                  {
                                    imageUrl:
                                      ""
                                  }
                                )
                              }
                            >
                              REMOVE IMAGE
                            </button>

                          )}

                        </div>

                        {option.imageUrl && (

                          <img
                            src={
                              option.imageUrl
                            }
                            alt={
                              `Option ${
                                String.fromCharCode(
                                  65 +
                                  optionIndex
                                )
                              }`
                            }
                            className="option-preview"
                          />

                        )}

                      </div>

                    )
                  )}

                  <label>
                    EXPLANATION AFTER REVEAL
                  </label>

                  <textarea
                    value={
                      question.explanation
                    }
                    onChange={e =>
                      updateQuestion(
                        questionIndex,
                        {
                          explanation:
                            e.target.value
                        }
                      )
                    }
                    placeholder="Explain why the answer is correct..."
                  />

                </section>

              )
            )}

          </>
        )}

        {/* =================================================
            QUIZ PLAYER
        ================================================= */}

        {page === "player" &&
          activeQuiz && (

            <section
              className="player"
            >

              <div className="hud">

                <span>
                  {
                    activeQuiz.title.toUpperCase()
                  }
                </span>

                <span>
                  QUESTION{" "}
                  {
                    String(
                      current + 1
                    ).padStart(
                      2,
                      "0"
                    )
                  }

                  {" / "}

                  {
                    String(
                      activeQuiz.questions.length
                    ).padStart(
                      2,
                      "0"
                    )
                  }
                </span>

              </div>

              <div className="panel">

                <div
                  className={
                    `timer ${
                      remaining <= 0
                        ? "expired"
                        : ""
                    }`
                  }
                >
                  00:
                  {
                    String(
                      remaining
                    ).padStart(
                      2,
                      "0"
                    )
                  }
                </div>

                <div className="progress">

                  <i
                    style={{
                      width:
                        `${
                          Math.max(
                            0,
                            (
                              remaining /
                              total
                            ) *
                            100
                          )
                        }%`
                    }}
                  />

                </div>

                <div className="question-text">

                  {
                    activeQuiz
                      .questions[
                        current
                      ].question
                  }

                </div>

                <div className="answers">

                  {
                    activeQuiz
                      .questions[
                        current
                      ]
                      .options
                      .map(
                        (
                          option,
                          i
                        ) => {

                          const question =
                            activeQuiz
                              .questions[
                                current
                              ];

                          const correct =
                            locked &&
                            i ===
                            question.correctAnswer;

                          const wrong =
                            locked &&
                            selected ===
                            i &&
                            i !==
                            question.correctAnswer;

                          return (

                            <button
                              key={i}
                              className={
                                `answer ${
                                  correct
                                    ? "correct"
                                    : ""
                                } ${
                                  wrong
                                    ? "wrong"
                                    : ""
                                }`
                              }
                              disabled={
                                locked
                              }
                              onClick={() =>
                                reveal(
                                  i
                                )
                              }
                            >

                              {option.imageUrl && (

                                <img
                                  src={
                                    option.imageUrl
                                  }
                                  alt=""
                                  className="answer-image"
                                />

                              )}

                              <div className="answer-label">

                                <b>
                                  {
                                    String.fromCharCode(
                                      65 + i
                                    )
                                  }
                                </b>

                                <span>
                                  {
                                    option.text
                                  }
                                </span>

                              </div>

                            </button>

                          );
                        }
                      )
                  }

                </div>

                {locked && (

                  <div className="reveal">

                    <h3>

                      {
                        selected ===
                        activeQuiz
                          .questions[
                            current
                          ]
                          .correctAnswer

                          ? "CORRECT // SYSTEM CONFIRMED"

                          : remaining <= 0

                            ? "TIME EXPIRED // ANSWER REVEALED"

                            : "INCORRECT // ANSWER REVEALED"
                      }

                    </h3>

                    <b>

                      ANSWER:{" "}

                      {
                        String.fromCharCode(
                          65 +
                          activeQuiz
                            .questions[
                              current
                            ]
                            .correctAnswer
                        )
                      }

                      {" — "}

                      {
                        activeQuiz
                          .questions[
                            current
                          ]
                          .options[
                            activeQuiz
                              .questions[
                                current
                              ]
                              .correctAnswer
                          ]
                          .text
                      }

                    </b>

                    <p>

                      {
                        activeQuiz
                          .questions[
                            current
                          ]
                          .explanation ||
                        "No explanation supplied."
                      }

                    </p>

                  </div>

                )}

                {locked && (

                  <div className="actions">

                    <button
                      className="primary"
                      onClick={
                        next
                      }
                    >

                      {
                        current ===
                        activeQuiz.questions.length - 1
                          ? "VIEW RESULTS →"
                          : "NEXT QUESTION →"
                      }

                    </button>

                  </div>

                )}

              </div>

            </section>

          )}

        {/* =================================================
            RESULT
        ================================================= */}

        {page === "result" &&
          activeQuiz && (

            <section
              className="panel center"
            >

              <div className="sub">
                SESSION COMPLETE
              </div>

              <h1>
                {
                  activeQuiz.title
                }
              </h1>

              <div className="score">
                {
                  percentage
                }%
              </div>

              <p className="sub">

                {
                  score
                } / {
                  activeQuiz.questions.length
                } correct responses.

              </p>

              <div className="actions center-actions">

                <button
                  className="primary"
                  onClick={() =>
                    go("quizzes")
                  }
                >
                  DATABASE
                </button>

                <button
                  onClick={() =>
                    launch(
                      activeQuiz._id
                    )
                  }
                >
                  RESTART
                </button>

              </div>

            </section>

          )}

      </main>
    </>
  );
}

createRoot(
  document.getElementById(
    "root"
  )
).render(
  <App />
);
