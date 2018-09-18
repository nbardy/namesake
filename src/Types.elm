module Types exposing (..)

import Window
import Time

import Dict


type alias Pos =
    ( Int, Int )


type alias Config =
    { padding : Int
    , size : Int
    }


type Background
    = Rainbow
    | NGon
    | Spinners
    | Stars
    | Drag
    | Perspective


type alias Model =
    { mouse : Pos
    , config : Config
    , background : Background
    , windowSize : Window.Size
    , t : Time.Time
    , popup : Bool
    , filledIn : List Pos
    , filledInDict : Dict.Dict Pos Bool
    }
