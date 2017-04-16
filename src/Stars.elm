module Stars exposing (renderStars)

-- Libraries

import Random
import Random.Extra
import Collage
import DrawingUtilities exposing (gridPoints, fillBackground, tween)
import Color exposing (Color)


-- User Modules

import Types exposing (..)


type alias Star =
    { radius : Float
    , pos : ( Float, Float )
    , brightness : ( Float, Float )
    , timeOffset : Float
    , cycleDuration : Float
    , color : Color.Color
    }


randomStarColor =
    [ (Color.rgb 155 176 255)
    , (Color.rgb 170 191 255)
    , (Color.rgb 202 215 255)
    , (Color.rgb 248 247 255)
    , (Color.rgb 255 244 234)
    , (Color.rgb 255 210 161)
    , (Color.rgb 255 204 111)
    ]
        |> List.map Random.Extra.constant
        |> Random.Extra.choices


randomStar : Model -> Pos -> Random.Generator Star
randomStar model ( row, col ) =
    let
        padding =
            model.config.padding
    in
        Random.Extra.map6 Star
            (Random.float 0 1)
            (Random.pair (Random.float (toFloat row) (toFloat (row + padding)))
                (Random.float (toFloat col) (toFloat (col + padding)))
            )
            (Random.pair (Random.float 0 0.4) (Random.float 0.4 1))
            (Random.float 0 1000)
            (Random.float 500 2400)
            randomStarColor


generateStars : Model -> Pos -> List Star
generateStars model ( row, col ) =
    let
        -- Using randomness to make noise but reseeded in the same spot every render so the positions stay constant and the stars don't move
        ( starCount, seed ) =
            Random.step (Random.int 1 6)
                (Random.initialSeed (row * 7913 + col))

        ( stars, _ ) =
            Random.step (Random.list starCount (randomStar model ( row, col )))
                seed
    in
        stars


renderStar : Model -> Star -> Collage.Form
renderStar model star =
    let
        rate =
            1000

        t =
            ((model.t + star.timeOffset) / star.cycleDuration)

        brightness =
            tween star.brightness (0.5 + (sin t) / 2)
    in
        Collage.circle star.radius
            |> Collage.filled star.color
            |> Collage.alpha brightness
            |> Collage.move star.pos


renderStars : Model -> Collage.Form
renderStars model =
    gridPoints model.config.padding model.windowSize
        |> List.concatMap (generateStars model)
        |> List.map (renderStar model)
        |> (++) [ fillBackground model.windowSize (Color.rgb 0 0 0) ]
        |> Collage.group
